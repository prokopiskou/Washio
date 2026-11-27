package gr.washio.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.CalendarContract;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// «Πρόσθεσε στο ημερολόγιο»: ανοίγει ΚΑΤΕΥΘΕΙΑΝ την εφαρμογή ημερολογίου (Google Calendar / Outlook)
// με το ραντεβού συμπληρωμένο. Αν η εφαρμογή δεν υπάρχει → reject("not_installed") → το JS ανοίγει web.
@CapacitorPlugin(name = "CalendarIntent")
public class CalendarIntentPlugin extends Plugin {
    @PluginMethod
    public void add(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI);
        i.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, (long) call.getDouble("begin", 0.0).doubleValue());
        i.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, (long) call.getDouble("end", 0.0).doubleValue());
        i.putExtra(CalendarContract.Events.TITLE, call.getString("title", ""));
        i.putExtra(CalendarContract.Events.EVENT_LOCATION, call.getString("location", ""));
        i.putExtra(CalendarContract.Events.DESCRIPTION, call.getString("description", ""));
        String pkg = call.getString("pkg", "");
        if (pkg != null && !pkg.isEmpty()) i.setPackage(pkg);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getActivity().startActivity(i);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("not_installed");
        } catch (Exception e) {
            call.reject("error");
        }
    }
}
