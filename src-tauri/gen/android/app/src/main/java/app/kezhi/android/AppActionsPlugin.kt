package app.kezhi.android

import android.app.Activity
import android.content.Intent
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@InvokeArg
class ExamCalendarFileArgs { lateinit var content: String }

@TauriPlugin
class AppActionsPlugin(private val activity: Activity) : Plugin(activity) {
  private val exporting = AtomicBoolean(false)
  private val worker = Executors.newSingleThreadExecutor()

  @Command
  fun goHome(invoke: Invoke) {
    activity.runOnUiThread {
      try {
        // Open the launcher without finishing the activity or terminating the process.
        activity.startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        invoke.resolve()
      } catch (error: Exception) { invoke.reject("无法返回桌面，请使用系统主页手势", error) }
    }
  }

  @Command
  fun saveExamCalendar(invoke: Invoke) {
    if (!exporting.compareAndSet(false, true)) { invoke.reject("已有文件正在导出"); return }
    try {
      val text = invoke.parseArgs(ExamCalendarFileArgs::class.java).content
      require(text.toByteArray(Charsets.UTF_8).size <= 4 * 1024 * 1024 && text.startsWith("BEGIN:VCALENDAR\r\n") && text.endsWith("END:VCALENDAR\r\n")) { "日历内容格式或大小无效" }
      activity.runOnUiThread {
        try {
          val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("text/calendar").putExtra(Intent.EXTRA_TITLE, "Kezhi-exams.ics")
          startActivityForResult(invoke, intent, "calendarFileChosen")
        } catch (error: Exception) { exporting.set(false); invoke.reject("无法打开系统文件保存窗口", error) }
      }
    } catch (error: Exception) { exporting.set(false); invoke.reject(error.message ?: "无法导出日历", error) }
  }

  @ActivityCallback
  fun calendarFileChosen(invoke: Invoke, result: ActivityResult) {
    val uri = result.data?.data
    if (result.resultCode != Activity.RESULT_OK || uri == null) {
      exporting.set(false); invoke.resolve(JSObject().put("saved", false)); return
    }
    worker.execute {
      try {
        val bytes = invoke.parseArgs(ExamCalendarFileArgs::class.java).content.toByteArray(Charsets.UTF_8)
        val stream = activity.contentResolver.openOutputStream(uri, "wt") ?: error("文件不可写")
        stream.use { it.write(bytes) }
        invoke.resolve(JSObject().put("saved", true))
      } catch (error: Exception) { invoke.reject("日历文件写入失败，请重新选择保存位置", error) }
      finally { exporting.set(false) }
    }
  }
}
