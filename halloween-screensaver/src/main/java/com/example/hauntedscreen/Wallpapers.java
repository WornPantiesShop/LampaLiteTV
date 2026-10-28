package com.example.hauntedscreen;

/** Stable order: persisted mode is one-based; keep existing selections compatible. */
final class Wallpapers {
    static final String[] FILES = {"ghosts-wall.mp4", "zombies.mp4", "autumn-rain.mp4"};
    static final int[] TITLES = {R.string.mode_ghosts, R.string.mode_zombies, R.string.mode_rain};
    static int indexForMode(int mode) { return mode >= 1 && mode <= FILES.length ? mode - 1 : 0; }
    private Wallpapers() { }
}
