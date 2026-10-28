package com.example.lampalitetv;
import java.net.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public final class CancelableRequestQueueTest {
    private static void check(boolean value,String message) { if(!value) throw new AssertionError(message); }
    private static final class SlowConnection extends HttpURLConnection {
        final CountDownLatch disconnected=new CountDownLatch(1);
        SlowConnection() throws Exception { super(new URL("https://example.invalid/")); }
        @Override public void connect() { }
        @Override public boolean usingProxy() { return false; }
        @Override public void disconnect() { disconnected.countDown(); }
        void waitForRead(long millis) {
            long until=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(millis);
            while(disconnected.getCount()!=0 && System.nanoTime()<until) {
                try {disconnected.await(Math.max(1,TimeUnit.NANOSECONDS.toMillis(until-System.nanoTime())),TimeUnit.MILLISECONDS);}
                catch(InterruptedException ignored) { /* Simulates network I/O requiring disconnect. */ }
            }
        }
    }
    public static void main(String[] args) throws Exception {
        try(CancelableRequestQueue q=new CancelableRequestQueue()) {
            AtomicInteger ran=new AtomicInteger();
            CancelableRequestQueue.Job early=q.reserve("early");q.cancel("early");
            check(!q.submit(early,j->ran.incrementAndGet()),"cancel before submit");
            SlowConnection slow=new SlowConnection();CountDownLatch started=new CountDownLatch(1),next=new CountDownLatch(1);
            CancelableRequestQueue.Job active=q.reserve("active");
            q.submit(active,j->{check(j.attach(slow),"attach active");started.countDown();slow.waitForRead(2000);j.detach(slow);if(!j.isCancelled())ran.incrementAndGet();});
            check(started.await(1,TimeUnit.SECONDS),"worker started");
            for(int i=0;i<16;i++){String id="queued"+i;q.submit(q.reserve(id),j->ran.incrementAndGet());}
            check(q.queuedCount()==16,"bounded queue");check(q.reserve("overflow")==null,"bounded reservations");
            for(int i=0;i<16;i++)q.cancel("queued"+i);
            check(q.queuedCount()==0,"cancel removes queued work");
            q.submit(q.reserve("next"),j->next.countDown());
            long before=System.nanoTime();q.cancel("active");
            check(next.await(1,TimeUnit.SECONDS),"next request must not wait for old I/O timeout");
            long elapsed=TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-before);
            check(slow.disconnected.getCount()==0,"physical disconnect");check(ran.get()==0,"cancelled callbacks suppressed");
            q.reserve("reserved");q.cancelAll();check(q.pendingCount()==0,"navigation clears reserved work");
            System.out.println("PASS cancel before submit, queue capacity/recovery, queued cancellation, running disconnect, no cancelled completion; next job after "+elapsed+"ms (simulated read timeout 2000ms)");
        }
        CancelableRequestQueue closed=new CancelableRequestQueue();closed.close();check(closed.reserve("late")==null,"closed queue");
    }
}
