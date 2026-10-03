package expo.modules.hivestorage

import androidx.core.content.FileProvider

// Own subclass so the manifest entry never clashes with other libraries' FileProviders.
class HiveFileProvider : FileProvider()
