package expo.modules.hivestorage

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.RandomAccessFile
import java.security.MessageDigest

/**
 * Content hashing for the duplicate finder.
 *
 * hashFiles(paths, quick)
 *   quick = true  -> SHA-1 over size + first / middle / last 64 KB (cheap pre-filter; files up to 128 KB are read fully)
 *   quick = false -> SHA-1 over the complete file (final proof that two files are identical)
 * Returns one hex string per path, or "" when a file cannot be read.
 */
class HiveDuplicatesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HiveDuplicates")

    AsyncFunction("hashFiles") { paths: List<String>, quick: Boolean ->
      paths.map { hashOne(it, quick) }
    }
  }

  private fun hashOne(path: String, quick: Boolean): String {
    try {
      val file = File(path)
      if (!file.isFile) return ""
      val md = MessageDigest.getInstance("SHA-1")
      val len = file.length()
      md.update(len.toString().toByteArray())
      val buf = ByteArray(64 * 1024)
      RandomAccessFile(file, "r").use { raf ->
        if (quick && len > 2L * buf.size) {
          val positions = longArrayOf(0L, len / 2 - buf.size / 2, len - buf.size)
          for (pos in positions) {
            raf.seek(pos)
            raf.readFully(buf)
            md.update(buf, 0, buf.size)
          }
        } else {
          while (true) {
            val n = raf.read(buf)
            if (n < 0) break
            if (n > 0) md.update(buf, 0, n)
          }
        }
      }
      val digest = md.digest()
      val sb = StringBuilder(digest.size * 2)
      for (b in digest) sb.append(String.format("%02x", b))
      return sb.toString()
    } catch (e: Exception) {
      return ""
    }
  }
}
