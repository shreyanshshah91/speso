package expo.modules.drivesave

import android.app.Activity
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

private const val CREATE_REQUEST = 7613

/**
 * Saves a file where the user chooses — Google Drive, Files, … — with Android's "Save to" picker
 * (ACTION_CREATE_DOCUMENT). Unlike handing the file to another app, this reports whether the file
 * was actually saved: the promise resolves with the new document's URI, or null if the user backed
 * out, so the app only records a backup that really happened.
 */
class DriveSaveModule : Module() {
  private var pendingPromise: Promise? = null
  private var pendingFile: File? = null

  override fun definition() = ModuleDefinition {
    Name("DriveSave")

    AsyncFunction("saveDocument") { fileUri: String, mimeType: String, title: String, promise: Promise ->
      if (pendingPromise != null) {
        promise.reject(CodedException("A save is already in progress."))
        return@AsyncFunction
      }
      val path = Uri.parse(fileUri).path
      if (path == null) {
        promise.reject(CodedException("Invalid file URI: $fileUri"))
        return@AsyncFunction
      }
      val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = mimeType
        putExtra(Intent.EXTRA_TITLE, title)
      }
      pendingPromise = promise
      pendingFile = File(path)
      try {
        appContext.throwingActivity.startActivityForResult(intent, CREATE_REQUEST)
      } catch (e: Exception) {
        pendingPromise = null
        pendingFile = null
        promise.reject(CodedException("Couldn't open the save screen: ${e.message}", e))
      }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { _, payload ->
      if (payload.requestCode != CREATE_REQUEST) return@OnActivityResult
      val promise = pendingPromise ?: return@OnActivityResult
      val source = pendingFile
      pendingPromise = null
      pendingFile = null
      val target = payload.data?.data
      if (payload.resultCode != Activity.RESULT_OK || target == null || source == null) {
        promise.resolve(null)
        return@OnActivityResult
      }
      try {
        val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
        val out = context.contentResolver.openOutputStream(target, "w") ?: throw CodedException("Couldn't open the new file.")
        out.use { stream -> source.inputStream().use { it.copyTo(stream) } }
        promise.resolve(target.toString())
      } catch (e: Exception) {
        promise.reject(CodedException("Couldn't save the file: ${e.message}", e))
      }
    }
  }
}
