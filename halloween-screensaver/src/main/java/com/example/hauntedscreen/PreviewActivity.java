package com.example.hauntedscreen;
import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
public final class PreviewActivity extends Activity {
    private VideoScene scene;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        scene = new VideoScene(this, getIntent().getIntExtra("scene", -1));
        setContentView(scene);
    }
    @Override protected void onResume() { super.onResume(); scene.start(); }
    @Override protected void onPause() { scene.stop(); super.onPause(); }
    @Override protected void onDestroy() { scene.release(); super.onDestroy(); }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if(event.getKeyCode() == KeyEvent.KEYCODE_VOLUME_UP || event.getKeyCode() == KeyEvent.KEYCODE_VOLUME_DOWN || event.getKeyCode() == KeyEvent.KEYCODE_VOLUME_MUTE) return super.dispatchKeyEvent(event);
        if(event.getAction() == KeyEvent.ACTION_UP) finish();
        return true;
    }
}
