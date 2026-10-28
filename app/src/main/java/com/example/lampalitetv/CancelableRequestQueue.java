package com.example.lampalitetv;

import java.net.HttpURLConnection;
import java.util.ArrayList;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/** Bounded serial network work with cancellation before dispatch and during I/O. */
final class CancelableRequestQueue implements AutoCloseable {
    private final ConcurrentHashMap<String, Job> jobs = new ConcurrentHashMap<>();
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(16), runnable -> { Thread t=new Thread(runnable,"Lampa-network"); t.setDaemon(true); return t; });
    private final ExecutorService disconnects = Executors.newSingleThreadExecutor(runnable -> {
        Thread t=new Thread(runnable,"Lampa-network-cancel"); t.setDaemon(true); return t;
    });

    final class Job {
        private final String id;
        private final AtomicBoolean cancelled = new AtomicBoolean();
        private volatile FutureTask<Void> future;
        private volatile HttpURLConnection connection;
        private Job(String id) { this.id=id; }
        boolean isCancelled() { return cancelled.get(); }
        boolean attach(HttpURLConnection next) {
            connection=next;
            if (isCancelled()) { next.disconnect(); return false; }
            return true;
        }
        void detach(HttpURLConnection previous) { if(connection==previous) connection=null; }
        void cancel() {
            if (!cancelled.compareAndSet(false,true)) return;
            jobs.remove(id,this);
            FutureTask<Void> task=future;
            if(task!=null) { task.cancel(true); worker.remove(task); }
            HttpURLConnection active=connection;
            // disconnect() may block in a device HTTP stack: keep it off the UI thread.
            if(active!=null) try { disconnects.execute(active::disconnect); } catch(RejectedExecutionException ignored) { }
        }
    }
    Job reserve(String id) {
        if(worker.isShutdown() || jobs.size()>=17) return null;
        Job job=new Job(id);
        return jobs.putIfAbsent(id,job)==null ? job : null;
    }
    boolean submit(Job job, Consumer<Job> task) {
        if(job.isCancelled()) return false;
        FutureTask<Void> future=new FutureTask<>(() -> {
            try { if(!job.isCancelled()) task.accept(job); }
            finally { jobs.remove(job.id,job); }
            return null;
        });
        job.future=future;
        if(job.isCancelled()) { future.cancel(true); return false; }
        try { worker.execute(future); }
        catch(RejectedExecutionException rejected) { job.cancel(); return false; }
        // Covers a cancel between the final preflight check and enqueue.
        if(job.isCancelled()) { future.cancel(true); worker.remove(future); }
        return true;
    }
    void cancel(String id) { Job job=jobs.get(id); if(job!=null) job.cancel(); }
    void cancelAll() { for(Job job:new ArrayList<>(jobs.values())) job.cancel(); }
    boolean isShutdown() { return worker.isShutdown(); }
    int pendingCount() { return jobs.size(); }
    int queuedCount() { return worker.getQueue().size(); }
    @Override public void close() { cancelAll(); worker.shutdownNow(); disconnects.shutdown(); }
}
