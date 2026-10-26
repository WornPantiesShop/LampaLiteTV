import android.app.Instrumentation;
import android.os.Looper;
import android.os.SystemClock;
public final class C645NavigationDriver {
    public static void main(String[] args) {
        Looper.prepare();
        Instrumentation input = new Instrumentation();
        int delay = Integer.parseInt(args[0]);
        SystemClock.sleep(3000);
        for (int i = 1; i < args.length; i++) {
            int key = Integer.parseInt(args[i]);
            input.sendKeyDownUpSync(key);
            System.out.println(key + " " + SystemClock.uptimeMillis());
            SystemClock.sleep(delay);
        }
    }
}
