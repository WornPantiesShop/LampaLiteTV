package com.example.hauntedscreen;
import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.provider.Settings;
import android.graphics.Color;
import android.widget.*;
public final class HomeActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(64,36,64,32); root.setBackgroundColor(Color.rgb(15,19,24));
        TextView title = new TextView(this); title.setText(R.string.app_name); title.setTextSize(30); title.setTextColor(Color.WHITE); root.addView(title);
        TextView note = new TextView(this); note.setText(R.string.description); note.setTextSize(17); note.setTextColor(Color.LTGRAY); note.setPadding(0,16,0,20); root.addView(note);
        Button preview = new Button(this); preview.setText(R.string.preview); root.addView(preview);
        preview.setOnClickListener(v -> startActivity(new Intent(this, PreviewActivity.class)));
        Button ghosts = new Button(this); root.addView(ghosts);
        Button zombies = new Button(this); root.addView(zombies);
        Runnable update = () -> {
            int mode = getSharedPreferences("ghost",MODE_PRIVATE).getInt("mode",1);
            ghosts.setText(getString(R.string.mode_ghosts) + (mode != 2 ? "  \u2713" : ""));
            zombies.setText(getString(R.string.mode_zombies) + (mode == 2 ? "  \u2713" : ""));
        };
        ghosts.setOnClickListener(v -> { getSharedPreferences("ghost",MODE_PRIVATE).edit().putInt("mode",1).apply(); update.run(); });
        zombies.setOnClickListener(v -> { getSharedPreferences("ghost",MODE_PRIVATE).edit().putInt("mode",2).apply(); update.run(); });
        update.run();
        Button settings = new Button(this); settings.setText(R.string.choose); root.addView(settings);
        settings.setOnClickListener(v -> { try { startActivity(new Intent(Settings.ACTION_DREAM_SETTINGS)); } catch(android.content.ActivityNotFoundException ex) { Toast.makeText(this, R.string.settings_unavailable, Toast.LENGTH_LONG).show(); } });
        setContentView(root); preview.requestFocus();
    }
}
