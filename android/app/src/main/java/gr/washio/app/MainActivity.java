package gr.washio.app;

import android.content.pm.ActivityInfo;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Κινητά: μόνο κάθετα. Tablet (≥600dp, π.χ. tablet στο ταμείο πλυντηρίου): γυρνάει ελεύθερα.
        if (getResources().getConfiguration().smallestScreenWidthDp >= 600) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_USER);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }
    }
}
