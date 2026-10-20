package com.taliesin.robocode;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Covers Blockly -> C++ -> Capacitor compiler -> JS ESP32 image conversion. */
@RunWith(AndroidJUnit4.class)
public class PhoneCompilerUiTest {
    @Test
    public void blinkCompilesThroughTheActualAppButton() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            awaitValue(scenario, "!!document.querySelector('#compile-phone') && !document.querySelector('#compile-phone').disabled", "true", 60);
            evaluate(scenario, "document.querySelector('#load-blink').click();document.querySelector('#hardware-tab').click();document.querySelector('#compile-phone').click();");
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(180);
            while (System.nanoTime() < deadline) {
                String output = evaluate(scenario, "document.querySelector('#phone-compiler-output').textContent");
                if (output.contains("Phone compilation failed")) fail(output);
                if (output.contains("Compiled on this phone:")) {
                    assertTrue(evaluate(scenario, "document.querySelector('#generated-code').textContent").contains("delay(1000)"));
                    assertTrue(evaluate(scenario, "document.querySelector('#build-panel').hidden").equals("true"));
                    return;
                }
                Thread.sleep(250);
            }
            fail("The app did not complete phone compilation: " + evaluate(scenario, "document.querySelector('#phone-compiler-output').textContent"));
        }
    }

    private static void awaitValue(ActivityScenario<MainActivity> scenario, String script, String expected, int seconds) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds);
        while (System.nanoTime() < deadline) {
            if (expected.equals(evaluate(scenario, script))) return;
            Thread.sleep(250);
        }
        fail("App did not become ready: " + evaluate(scenario, "document.body.innerText"));
    }

    private static String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch ready = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value);
            ready.countDown();
        }));
        assertTrue("WebView did not respond", ready.await(10, TimeUnit.SECONDS));
        return result.get();
    }
}
