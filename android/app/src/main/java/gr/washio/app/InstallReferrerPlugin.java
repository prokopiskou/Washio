package gr.washio.app;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.android.installreferrer.api.ReferrerDetails;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Google Play Install Referrer: το «referrer» του link του Play Store (π.χ. …&wl=<token>)
// → η εφαρμογή συνδέεται αυτόματα με τον λογαριασμό του web (lib/app-handoff).
@CapacitorPlugin(name = "InstallReferrer")
public class InstallReferrerPlugin extends Plugin {
    @PluginMethod
    public void get(final PluginCall call) {
        final InstallReferrerClient client = InstallReferrerClient.newBuilder(getContext()).build();
        try {
            client.startConnection(new InstallReferrerStateListener() {
                @Override
                public void onInstallReferrerSetupFinished(int code) {
                    JSObject ret = new JSObject();
                    try {
                        if (code == InstallReferrerClient.InstallReferrerResponse.OK) {
                            ReferrerDetails d = client.getInstallReferrer();
                            ret.put("referrer", d.getInstallReferrer());
                            ret.put("clickTs", d.getReferrerClickTimestampSeconds());
                        } else {
                            ret.put("referrer", "");
                        }
                    } catch (Exception e) {
                        ret.put("referrer", "");
                    }
                    try { client.endConnection(); } catch (Exception ignored) {}
                    call.resolve(ret);
                }

                @Override
                public void onInstallReferrerServiceDisconnected() { /* μία προσπάθεια αρκεί */ }
            });
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("referrer", "");
            call.resolve(ret);
        }
    }
}
