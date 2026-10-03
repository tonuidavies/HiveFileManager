package expo.modules.hivestorage

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.MediaStore
import android.provider.Settings
import android.webkit.MimeTypeMap
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.ArrayDeque
import java.util.Locale
import java.util.concurrent.atomic.AtomicInteger
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/** Error with a clean, user-readable message on the JS side. */
class HiveException(message: String) : CodedException(message)

/**
 * Fast, native file access for Hive File Manager.
 * Every listing returns all metadata in ONE call, instead of one slow call per file.
 */
class HiveStorageModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw HiveException("App context is not available")

  private val rootDir: File
    get() = Environment.getExternalStorageDirectory()

  private val searchGeneration = AtomicInteger(0)

  override fun definition() = ModuleDefinition {
    Name("HiveStorage")

    // ---------- Permission ----------
    Function("hasAllFilesAccess") { hasAccess() }

    Function("needsAllFilesAccessSettings") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.R }

    Function("openAllFilesAccessSettings") { openAccessSettings() }

    // ---------- Storage info ----------
    Function("getRootPath") { rootDir.absolutePath }

    Function("getStorageInfo") {
      val stat = StatFs(rootDir.absolutePath)
      val total = stat.totalBytes.toDouble()
      val free = stat.availableBytes.toDouble()
      mapOf("total" to total, "free" to free, "used" to (total - free))
    }

    // ---------- Listing ----------
    AsyncFunction("listDir") { path: String, showHidden: Boolean ->
      val dir = File(path)
      val children = dir.listFiles() ?: throw HiveException("Cannot open folder: ${dir.name}")
      children
        .filter { showHidden || !it.name.startsWith(".") }
        .map { describe(it, true) }
    }

    AsyncFunction("getDetails") { path: String ->
      val f = File(path)
      if (!f.exists()) throw HiveException("Item no longer exists")
      val base = describe(f, true).toMutableMap()
      if (f.isDirectory) {
        var size = 0L
        var files = 0
        var folders = 0
        for (child in f.walkTopDown()) {
          if (child == f) continue
          if (child.isDirectory) {
            folders += 1
          } else {
            files += 1
            size += child.length()
          }
        }
        base["size"] = size.toDouble()
        base["files"] = files
        base["folders"] = folders
      }
      base["readable"] = f.canRead()
      base["writable"] = f.canWrite()
      base["mime"] = mimeOf(f.name)
      base
    }

    // ---------- Media index (fast categories) ----------
    AsyncFunction("scanSummary") { recentLimit: Int ->
      scanSummary(recentLimit)
    }

    AsyncFunction("queryCategory") { category: String, limit: Int ->
      queryCategory(category, limit)
    }

    // ---------- Search ----------
    AsyncFunction("search") { base: String, query: String, showHidden: Boolean, limit: Int ->
      val generation = searchGeneration.incrementAndGet()
      search(base, query.trim().lowercase(Locale.ROOT), showHidden, limit, generation)
    }

    Function("cancelSearch") { searchGeneration.incrementAndGet() }

    // ---------- File operations ----------
    AsyncFunction("mkdir") { parent: String, name: String ->
      val target = File(parent, safeName(name))
      if (target.exists()) throw HiveException("A file or folder with this name already exists")
      if (!target.mkdirs()) throw HiveException("Could not create folder")
      describe(target, true)
    }

    AsyncFunction("createFile") { parent: String, name: String ->
      val target = File(parent, safeName(name))
      if (target.exists()) throw HiveException("A file with this name already exists")
      if (!target.createNewFile()) throw HiveException("Could not create file")
      scan(listOf(target.absolutePath))
      describe(target, true)
    }

    AsyncFunction("rename") { path: String, newName: String ->
      val src = File(path)
      val target = File(src.parentFile, safeName(newName))
      if (target.exists()) throw HiveException("A file or folder with this name already exists")
      if (!src.renameTo(target)) throw HiveException("Could not rename")
      forgetInMediaStore(src.absolutePath)
      scan(listOf(target.absolutePath))
      describe(target, true)
    }

    AsyncFunction("copy") { src: String, destDir: String ->
      val source = File(src)
      val dest = File(destDir)
      if (source.isDirectory && isInside(dest, source)) throw HiveException("Cannot copy a folder into itself")
      val target = uniqueTarget(dest, source.name)
      if (source.isDirectory) source.copyRecursively(target, false) else source.copyTo(target, false)
      scan(listOf(target.absolutePath))
      target.absolutePath
    }

    AsyncFunction("move") { src: String, destDir: String ->
      val source = File(src)
      val dest = File(destDir)
      if (source.parentFile?.absolutePath == dest.absolutePath) return@AsyncFunction source.absolutePath
      if (source.isDirectory && isInside(dest, source)) throw HiveException("Cannot move a folder into itself")
      val target = uniqueTarget(dest, source.name)
      moveFile(source, target)
      target.absolutePath
    }

    // Move to an exact path (used by Trash restore)
    AsyncFunction("moveTo") { src: String, destPath: String ->
      val source = File(src)
      var target = File(destPath)
      target.parentFile?.mkdirs()
      if (target.exists()) target = uniqueTarget(target.parentFile ?: rootDir, target.name)
      moveFile(source, target)
      target.absolutePath
    }

    AsyncFunction("remove") { path: String ->
      val f = File(path)
      if (!f.exists()) return@AsyncFunction true
      val ok = if (f.isDirectory) f.deleteRecursively() else f.delete()
      if (!ok) throw HiveException("Could not delete ${f.name}")
      forgetInMediaStore(f.absolutePath)
      true
    }

    AsyncFunction("zip") { paths: List<String>, destZip: String ->
      val out = File(destZip)
      val target = if (out.exists()) uniqueTarget(out.parentFile ?: rootDir, out.name) else out
      ZipOutputStream(FileOutputStream(target).buffered()).use { zos ->
        paths.map { File(it) }.forEach { addToZip(zos, it, it.name) }
      }
      scan(listOf(target.absolutePath))
      target.absolutePath
    }

    AsyncFunction("unzip") { zipPath: String, destDir: String ->
      val zipFile = File(zipPath)
      val outDir = uniqueTarget(File(destDir), zipFile.nameWithoutExtension)
      outDir.mkdirs()
      val canonicalOut = outDir.canonicalPath + File.separator
      ZipInputStream(FileInputStream(zipFile).buffered()).use { zis ->
        var entry: ZipEntry? = zis.nextEntry
        while (entry != null) {
          val outFile = File(outDir, entry.name)
          // Zip-slip protection
          val outCanonical = outFile.canonicalPath
          if (outCanonical != outDir.canonicalPath && !outCanonical.startsWith(canonicalOut)) throw HiveException("Unsafe archive entry")
          if (entry.isDirectory) {
            outFile.mkdirs()
          } else {
            outFile.parentFile?.mkdirs()
            FileOutputStream(outFile).buffered().use { zis.copyTo(it) }
          }
          zis.closeEntry()
          entry = zis.nextEntry
        }
      }
      scan(listOf(outDir.absolutePath))
      outDir.absolutePath
    }

    AsyncFunction("readText") { path: String, maxBytes: Int ->
      val f = File(path)
      if (f.length() > maxBytes) {
        val buf = ByteArray(maxBytes)
        val read = FileInputStream(f).use { it.read(buf) }
        String(buf, 0, maxOf(read, 0), Charsets.UTF_8)
      } else {
        f.readText(Charsets.UTF_8)
      }
    }

    AsyncFunction("writeText") { path: String, text: String ->
      File(path).writeText(text, Charsets.UTF_8)
      scan(listOf(path))
      true
    }

    // ---------- Thumbnails (video frames / audio covers) ----------
    AsyncFunction("mediaThumbnail") { path: String ->
      mediaThumbnail(path)
    }

    // ---------- Cleaner ----------
    AsyncFunction("cleanerScan") { largeMinBytes: Double ->
      cleanerScan(largeMinBytes.toLong())
    }

    // ---------- Open / share ----------
    Function("openFile") { path: String, mime: String? ->
      openFile(path, mime)
    }

    Function("shareFiles") { paths: List<String> ->
      shareFiles(paths)
    }

    Function("scanFiles") { paths: List<String> ->
      scan(paths)
    }
  }

  // =====================================================================
  // Permission
  // =====================================================================
  private fun hasAccess(): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      Environment.isExternalStorageManager()
    } else {
      val ctx = context
      ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED &&
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    }
  }

  private fun openAccessSettings(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false
    val appIntent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
      .setData(Uri.parse("package:" + context.packageName))
    if (start(appIntent)) return true
    return start(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
  }

  private fun start(intent: Intent): Boolean {
    val activity: Activity? = appContext.currentActivity
    return try {
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
      true
    } catch (e: Exception) {
      false
    }
  }

  // =====================================================================
  // Helpers
  // =====================================================================
  private fun describe(f: File, withCount: Boolean): Map<String, Any?> {
    val isDir = f.isDirectory
    return mapOf(
      "name" to f.name,
      "path" to f.absolutePath,
      "isDir" to isDir,
      "size" to if (isDir) 0.0 else f.length().toDouble(),
      "mtime" to f.lastModified().toDouble(),
      "count" to if (isDir && withCount) (f.list()?.size ?: 0) else 0
    )
  }

  private fun safeName(name: String): String {
    val clean = name.trim().replace(Regex("[\\\\/:*?\"<>|]"), "_")
    if (clean.isEmpty() || clean == "." || clean == "..") throw HiveException("Invalid name")
    return clean
  }

  private fun isInside(child: File, parent: File): Boolean {
    val p = parent.canonicalPath + File.separator
    return (child.canonicalPath + File.separator).startsWith(p)
  }

  private fun uniqueTarget(dir: File, name: String): File {
    var candidate = File(dir, name)
    if (!candidate.exists()) return candidate
    val dot = name.lastIndexOf('.')
    val hasExt = dot > 0 && !File(dir, name).isDirectory
    val base = if (hasExt) name.substring(0, dot) else name
    val ext = if (hasExt) name.substring(dot) else ""
    var i = 1
    while (candidate.exists()) {
      candidate = File(dir, "$base ($i)$ext")
      i++
    }
    return candidate
  }

  private fun moveFile(source: File, target: File) {
    val oldPath = source.absolutePath
    if (!source.renameTo(target)) {
      // Different volume: copy then delete
      if (source.isDirectory) source.copyRecursively(target, false) else source.copyTo(target, false)
      if (source.isDirectory) source.deleteRecursively() else source.delete()
    }
    forgetInMediaStore(oldPath)
    scan(listOf(target.absolutePath))
  }

  private fun addToZip(zos: ZipOutputStream, file: File, entryName: String) {
    if (file.isDirectory) {
      zos.putNextEntry(ZipEntry("$entryName/"))
      zos.closeEntry()
      file.listFiles()?.forEach { addToZip(zos, it, "$entryName/${it.name}") }
    } else {
      zos.putNextEntry(ZipEntry(entryName))
      FileInputStream(file).buffered().use { it.copyTo(zos) }
      zos.closeEntry()
    }
  }

  private fun scan(paths: List<String>) {
    try {
      MediaScannerConnection.scanFile(context, paths.toTypedArray(), null, null)
    } catch (e: Exception) {
      // ignore
    }
  }

  /**
   * Removes stale index rows for a path that no longer exists (after move / delete),
   * so categories update instantly. Uses an exact prefix range (no LIKE wildcards),
   * and only runs when the path is really gone, so it can never touch other files.
   */
  private fun forgetInMediaStore(path: String) {
    if (File(path).exists()) {
      scan(listOf(path))
      return
    }
    val data = MediaStore.MediaColumns.DATA
    try {
      context.contentResolver.delete(
        MediaStore.Files.getContentUri("external"),
        "$data = ? OR ($data >= ? AND $data < ?)",
        arrayOf(path, "$path/", "${path}0") // '0' is the character right after '/'
      )
    } catch (e: Exception) {
      // Not critical: the media index refreshes on its own
      scan(listOf(path))
    }
  }

  private fun extOf(name: String): String {
    val dot = name.lastIndexOf('.')
    return if (dot >= 0 && dot < name.length - 1) name.substring(dot + 1).lowercase(Locale.ROOT) else ""
  }

  private fun mimeOf(name: String): String? {
    val ext = extOf(name)
    if (ext.isEmpty()) return null
    if (ext == "apk") return "application/vnd.android.package-archive"
    return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
  }

  // =====================================================================
  // Categories
  // =====================================================================
  private val categoryExt: Map<String, Set<String>> = mapOf(
    "images" to setOf("jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "avif"),
    "videos" to setOf("mp4", "mkv", "avi", "mov", "3gp", "webm", "m4v", "flv", "wmv", "ts", "mpeg", "mpg"),
    "audio" to setOf("mp3", "wav", "aac", "m4a", "ogg", "opus", "flac", "amr", "wma", "mid", "midi"),
    "documents" to setOf("pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "csv", "odt", "ods", "odp", "epub", "md", "json", "xml", "html", "htm"),
    "apks" to setOf("apk", "apks", "xapk"),
    "archives" to setOf("zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz")
  )

  private fun categoryOf(name: String): String? {
    val ext = extOf(name)
    if (ext.isEmpty()) return null
    for ((cat, set) in categoryExt) if (set.contains(ext)) return cat
    return null
  }

  private fun scanSummary(recentLimit: Int): Map<String, Any?> {
    val counts = HashMap<String, Int>()
    val sizes = HashMap<String, Long>()
    val recent = ArrayList<Map<String, Any?>>()
    val downloadsPrefix = File(rootDir, Environment.DIRECTORY_DOWNLOADS).absolutePath + "/"
    val cols = arrayOf(
      MediaStore.MediaColumns.DATA,
      MediaStore.MediaColumns.SIZE,
      MediaStore.MediaColumns.DATE_MODIFIED
    )
    context.contentResolver.query(
      MediaStore.Files.getContentUri("external"),
      cols,
      null,
      null,
      "${MediaStore.MediaColumns.DATE_MODIFIED} DESC"
    )?.use { c ->
      while (c.moveToNext()) {
        val path = c.getString(0) ?: continue
        if (path.contains("/.")) continue
        val size = c.getLong(1)
        val name = path.substringAfterLast('/')
        val cat = categoryOf(name)
        if (path.startsWith(downloadsPrefix)) {
          counts["downloads"] = (counts["downloads"] ?: 0) + 1
          sizes["downloads"] = (sizes["downloads"] ?: 0L) + size
        }
        if (cat == null) continue
        counts[cat] = (counts[cat] ?: 0) + 1
        sizes[cat] = (sizes[cat] ?: 0L) + size
        if (recent.size < recentLimit && size > 0) {
          val f = File(path)
          if (f.exists() && f.isFile) {
            recent.add(
              mapOf(
                "name" to name,
                "path" to path,
                "isDir" to false,
                "size" to size.toDouble(),
                "mtime" to c.getLong(2) * 1000.0,
                "count" to 0
              )
            )
          }
        }
      }
    }
    val cats = HashMap<String, Map<String, Any>>()
    for (key in listOf("images", "videos", "audio", "documents", "apks", "archives", "downloads")) {
      cats[key] = mapOf("count" to (counts[key] ?: 0), "size" to (sizes[key] ?: 0L).toDouble())
    }
    return mapOf("categories" to cats, "recent" to recent)
  }

  private fun queryCategory(category: String, limit: Int): List<Map<String, Any?>> {
    val result = ArrayList<Map<String, Any?>>()
    val data = MediaStore.MediaColumns.DATA
    val cols = arrayOf(data, MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.DATE_MODIFIED)
    var selection: String? = null
    var args: Array<String>? = null
    var order = "${MediaStore.MediaColumns.DATE_MODIFIED} DESC"
    when (category) {
      "large" -> {
        selection = "${MediaStore.MediaColumns.SIZE} >= ?"
        args = arrayOf((50L * 1024 * 1024).toString())
        order = "${MediaStore.MediaColumns.SIZE} DESC"
      }
      "downloads" -> {
        selection = "$data LIKE ?"
        args = arrayOf(File(rootDir, Environment.DIRECTORY_DOWNLOADS).absolutePath + "/%")
      }
      "recent" -> {
        // newest files of any known type
      }
      else -> {
        val exts = categoryExt[category] ?: return result
        selection = exts.joinToString(" OR ") { "$data LIKE ?" }
        args = exts.map { "%.$it" }.toTypedArray()
      }
    }
    context.contentResolver.query(
      MediaStore.Files.getContentUri("external"), cols, selection, args, order
    )?.use { c ->
      while (c.moveToNext() && result.size < limit) {
        val path = c.getString(0) ?: continue
        if (path.contains("/.")) continue
        val name = path.substringAfterLast('/')
        if (category == "recent" && categoryOf(name) == null) continue
        val f = File(path)
        if (!f.exists() || f.isDirectory) continue
        result.add(
          mapOf(
            "name" to name,
            "path" to path,
            "isDir" to false,
            "size" to c.getLong(1).toDouble(),
            "mtime" to c.getLong(2) * 1000.0,
            "count" to 0
          )
        )
      }
    }
    return result
  }

  // =====================================================================
  // Search
  // =====================================================================
  private fun isSystemDir(f: File): Boolean {
    val p = f.absolutePath
    val root = rootDir.absolutePath
    return p == "$root/Android/data" || p == "$root/Android/obb"
  }

  private fun search(base: String, q: String, showHidden: Boolean, limit: Int, generation: Int): List<Map<String, Any?>> {
    val results = ArrayList<Map<String, Any?>>()
    if (q.isEmpty()) return results
    val queue = ArrayDeque<File>()
    queue.add(File(base))
    var visited = 0
    while (queue.isNotEmpty() && results.size < limit && visited < 400_000) {
      if (searchGeneration.get() != generation) break // a newer search started
      val dir = queue.removeFirst()
      val children = dir.listFiles() ?: continue
      for (child in children) {
        visited++
        val name = child.name
        if (!showHidden && name.startsWith(".")) continue
        if (name.lowercase(Locale.ROOT).contains(q)) {
          results.add(describe(child, false))
          if (results.size >= limit) break
        }
        if (child.isDirectory && !isSystemDir(child)) queue.add(child)
      }
    }
    return results
  }

  // =====================================================================
  // Thumbnails
  // =====================================================================
  private fun mediaThumbnail(path: String): String? {
    val src = File(path)
    if (!src.exists()) return null
    val dir = File(context.cacheDir, "hive_thumbs")
    if (!dir.exists()) dir.mkdirs()
    val key = (path.hashCode().toLong() * 31 + src.lastModified()).toString(16).replace("-", "n")
    val out = File(dir, "$key.jpg")
    if (out.exists() && out.length() > 0) return Uri.fromFile(out).toString()
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(path)
      var bmp: Bitmap? = null
      val art = retriever.embeddedPicture
      if (art != null) bmp = BitmapFactory.decodeByteArray(art, 0, art.size)
      if (bmp == null) {
        bmp = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          retriever.getScaledFrameAtTime(1_000_000L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 320, 320)
        } else {
          retriever.getFrameAtTime(1_000_000L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
        }
      }
      if (bmp == null) return null
      val scaled = scaleDown(bmp, 320)
      FileOutputStream(out).use { scaled.compress(Bitmap.CompressFormat.JPEG, 75, it) }
      return Uri.fromFile(out).toString()
    } catch (e: Exception) {
      return null
    } finally {
      try {
        retriever.release()
      } catch (e: Exception) {
        // ignore
      }
    }
  }

  private fun scaleDown(bmp: Bitmap, max: Int): Bitmap {
    val w = bmp.width
    val h = bmp.height
    if (w <= max && h <= max) return bmp
    val ratio = minOf(max.toFloat() / w, max.toFloat() / h)
    return Bitmap.createScaledBitmap(bmp, (w * ratio).toInt().coerceAtLeast(1), (h * ratio).toInt().coerceAtLeast(1), true)
  }

  // =====================================================================
  // Cleaner
  // =====================================================================
  private fun cleanerScan(largeMin: Long): Map<String, Any?> {
    val junk = ArrayList<Map<String, Any?>>()
    val empty = ArrayList<Map<String, Any?>>()
    val apks = ArrayList<Map<String, Any?>>()
    val large = ArrayList<Map<String, Any?>>()
    val junkExt = setOf("tmp", "temp", "log", "dmp", "chk")
    // Android's own top-level folders: never offered for deletion even when empty
    val standardDirs = setOf(
      "Alarms", "Audiobooks", "DCIM", "Documents", "Download", "Movies", "Music",
      "Notifications", "Pictures", "Podcasts", "Recordings", "Ringtones", "Android"
    )
    val cap = 500
    val queue = ArrayDeque<File>()
    queue.add(rootDir)
    var visited = 0
    while (queue.isNotEmpty() && visited < 400_000) {
      val dir = queue.removeFirst()
      val children = dir.listFiles() ?: continue
      for (child in children) {
        visited++
        val name = child.name
        if (child.isDirectory) {
          if (isSystemDir(child) || name == ".HiveTrash") continue
          if (name == ".thumbnails" || name == ".Thumbnails") {
            child.listFiles()?.forEach { t ->
              if (t.isFile && junk.size < cap) junk.add(describe(t, false))
            }
            continue
          }
          val list = child.list()
          if (list != null && list.isEmpty()) {
            val isStandardDir = dir.absolutePath == rootDir.absolutePath && standardDirs.contains(name)
            if (empty.size < cap && !name.startsWith(".") && !isStandardDir) empty.add(describe(child, false))
          } else {
            queue.add(child)
          }
        } else {
          val ext = extOf(name)
          val len = child.length()
          when {
            junkExt.contains(ext) || name.equals("thumbs.db", true) ->
              if (junk.size < cap) junk.add(describe(child, false))
            ext == "apk" -> if (apks.size < cap) apks.add(describe(child, false))
            len >= largeMin -> if (large.size < cap) large.add(describe(child, false))
          }
        }
      }
    }
    large.sortByDescending { (it["size"] as Double) }
    return mapOf("junk" to junk, "empty" to empty, "apks" to apks, "large" to large)
  }

  // =====================================================================
  // Open & share
  // =====================================================================
  private fun uriFor(f: File): Uri =
    FileProvider.getUriForFile(context, context.packageName + ".hivefileprovider", f)

  private fun openFile(path: String, mime: String?): Boolean {
    val f = File(path)
    if (!f.exists()) return false
    val uri = try {
      uriFor(f)
    } catch (e: Exception) {
      return false
    }
    // mime == "chooser" -> always show the "Open with" app picker
    val forceChooser = mime == "chooser"
    val type = (if (forceChooser) null else mime) ?: mimeOf(f.name) ?: "*/*"
    val intent = Intent(Intent.ACTION_VIEW)
      .setDataAndType(uri, type)
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
    intent.clipData = ClipData.newRawUri(f.name, uri)
    if (forceChooser) {
      if (start(Intent.createChooser(intent, "Open with"))) return true
    } else if (start(intent)) {
      return true
    }
    // No app for this exact type: let the user pick any app
    val generic = Intent(Intent.ACTION_VIEW)
      .setDataAndType(uri, "*/*")
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    generic.clipData = ClipData.newRawUri(f.name, uri)
    return start(Intent.createChooser(generic, "Open with"))
  }

  private fun shareFiles(paths: List<String>): Boolean {
    val files = paths.map { File(it) }.filter { it.exists() && it.isFile }
    if (files.isEmpty()) return false
    val uris = ArrayList<Uri>()
    try {
      files.forEach { uris.add(uriFor(it)) }
    } catch (e: Exception) {
      return false
    }
    val types = files.map { mimeOf(it.name) ?: "*/*" }.toSet()
    val type = if (types.size == 1) types.first() else "*/*"
    val intent: Intent
    if (uris.size == 1) {
      intent = Intent(Intent.ACTION_SEND).setType(type).putExtra(Intent.EXTRA_STREAM, uris[0])
    } else {
      intent = Intent(Intent.ACTION_SEND_MULTIPLE).setType(type).putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
    }
    val clip = ClipData.newRawUri(files[0].name, uris[0])
    for (i in 1 until uris.size) clip.addItem(ClipData.Item(uris[i]))
    intent.clipData = clip
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    val chooser = Intent.createChooser(intent, "Share")
    chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    return start(chooser)
  }
}
