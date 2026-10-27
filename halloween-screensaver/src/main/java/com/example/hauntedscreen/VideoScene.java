package com.example.hauntedscreen;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.graphics.Color;
import android.media.*;
import android.util.Log;
import android.view.*;
import android.widget.*;

/** Hardware-decoded local video, no WebView, network or background playback. */
final class VideoScene extends FrameLayout implements SurfaceHolder.Callback {
    private final SurfaceView surface;
    private final int mode;
    private MediaPlayer player;
    private boolean running, released;
    private int index;

    VideoScene(Context context) { this(context, -1); }
    VideoScene(Context context, int previewIndex) {
        super(context);
        setBackgroundColor(Color.BLACK);
        mode = previewIndex >= 0 && previewIndex <= 1 ? previewIndex + 1
                : context.getSharedPreferences("ghost", Context.MODE_PRIVATE).getInt("mode", 1);
        index = mode == 2 ? 1 : 0;
        surface = new SurfaceView(context);
        surface.getHolder().addCallback(this);
        addView(surface, new LayoutParams(-1,-1));

    }
    void start() {
        if(running || released) return;
        running = true;
        if(surface.getHolder().getSurface().isValid()) play();
    }
    private void play() {
        releasePlayer();
        if(!running || released) return;
        final String clip = index == 0 ? "ghosts-wall.mp4" : "zombies.mp4";
        MediaPlayer current = new MediaPlayer(); player = current;
        try (AssetFileDescriptor fd = getContext().getAssets().openFd(clip)) {
            current.setDataSource(fd.getFileDescriptor(), fd.getStartOffset(), fd.getLength());
            current.setDisplay(surface.getHolder());
            current.setVolume(0f,0f);
            current.setLooping(true);
            current.setOnPreparedListener(mp -> {
                if(!running || player != mp) return;
                mp.start();
                Log.i("HauntedScreen", "playing " + clip + " " + mp.getVideoWidth() + "x" + mp.getVideoHeight());
            });
            current.setOnInfoListener((mp, what, extra) -> {
                if(what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START) Log.i("HauntedScreen", "first video frame " + clip);
                return false;
            });
            current.setOnErrorListener((mp, what, extra) -> { Log.e("HauntedScreen", "video error " + what + "/" + extra); failure(); return true; });
            current.prepareAsync();
        } catch(Exception ex) { Log.e("HauntedScreen", "video unavailable", ex); failure(); }
    }
    private void failure() {
        stop();
        TextView message = new TextView(getContext()); message.setText(R.string.video_error);
        message.setTextSize(22); message.setTextColor(Color.WHITE); message.setGravity(Gravity.CENTER);
        addView(message,new LayoutParams(-1,-1));
    }
    private void releasePlayer() {
        if(player != null) { MediaPlayer previous=player; player=null; previous.setOnErrorListener(null); previous.release(); }
    }
    void stop() { running=false; releasePlayer(); }
    void release() { if(released) return; stop(); released=true; surface.getHolder().removeCallback(this); }
    @Override public void surfaceCreated(SurfaceHolder holder) { if(running) play(); }
    @Override public void surfaceChanged(SurfaceHolder holder,int format,int width,int height) { }
    @Override public void surfaceDestroyed(SurfaceHolder holder) { releasePlayer(); }
}
