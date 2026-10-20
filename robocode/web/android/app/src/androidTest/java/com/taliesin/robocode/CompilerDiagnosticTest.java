package com.taliesin.robocode;

import static org.junit.Assert.assertEquals;
import static org.junit.Assume.assumeTrue;

import android.content.Context;
import android.system.Os;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import java.util.ArrayList;
import java.util.List;

/** Opt-in diagnostic; invoke with instrumentation argument traceCompiler=true. */
public class CompilerDiagnosticTest {
    @Test
    public void traceCompilerStartup() throws Exception {
        assumeTrue("true".equals(InstrumentationRegistry.getArguments().getString("traceCompiler")));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File nativeDir = new File(context.getApplicationInfo().nativeLibraryDir);
        File runtime = new File(context.getCacheDir(), "trace-runtime");
        runtime.mkdirs();
        String[][] mappings = {
            {"libc.so.6", "librc_c.so"}, {"libm.so.6", "librc_m.so"},
            {"libdl.so.2", "librc_dl.so"}, {"ld-linux-x86-64.so.2", "librc_loader.so"},
            {"libncursesw.so.6", "libncursesw.so"}, {"libdw.so.1", "libdw.so"},
            {"libelf.so.1", "libelf.so"}, {"libz.so.1", "libz.so"},
            {"libzstd.so.1", "libzstd.so"}, {"liblzma.so.5", "liblzma.so"},
            {"libbz2.so.1.0", "libbz2.so"}
        };
        for (String[] mapping : mappings) {
            File alias = new File(runtime, mapping[0]);
            alias.delete();
            Os.symlink(new File(nativeDir, mapping[1]).getAbsolutePath(), alias.getAbsolutePath());
        }
        if ("true".equals(InstrumentationRegistry.getArguments().getString("traceLinker"))) {
            RoboCodeCompilerPlugin compiler = new RoboCodeCompilerPlugin() {
                @Override
                void runStage(List<String> command, File job, StringBuilder log) throws Exception {
                    if (!command.get(3).endsWith("librc_ld.so")) {
                        super.runStage(command, job, log);
                        return;
                    }
                    List<String> traced = new ArrayList<>();
                    traced.add(new File(nativeDir, "librc_strace.so").getAbsolutePath());
                    traced.add("-f");
                    traced.add("-qq");
                    traced.addAll(command);
                    ProcessBuilder builder = new ProcessBuilder(traced).directory(job);
                    builder.environment().put("LD_LIBRARY_PATH", runtime + ":" + nativeDir);
                    runTrace(builder);
                }
            };
            String sketch = "true".equals(InstrumentationRegistry.getArguments().getString("traceInvalidLink"))
                ? "#include <Arduino.h>\nextern void ROBOCODE_MISSING_FUNCTION();\nvoid setup(){ROBOCODE_MISSING_FUNCTION();}\nvoid loop(){}\n"
                : "#include <Arduino.h>\nvoid setup(){pinMode(2,OUTPUT);}\nvoid loop(){digitalWrite(2,HIGH);delay(317);digitalWrite(2,LOW);delay(683);}\n";
            compiler.compileSketch(context, sketch, message -> {});
            return;
        }
        ProcessBuilder builder = new ProcessBuilder(
            new File(nativeDir, "librc_strace.so").getAbsolutePath(), "-f", "-qq",
            new File(nativeDir, "librc_loader.so").getAbsolutePath(), "--library-path", runtime.getAbsolutePath(),
            new File(nativeDir, "librc_cc1plus.so").getAbsolutePath(), "--version");
        builder.environment().put("LD_LIBRARY_PATH", runtime.getAbsolutePath() + ":" + nativeDir.getAbsolutePath());
        runTrace(builder);
    }

    private static void runTrace(ProcessBuilder builder) throws Exception {
        builder.redirectErrorStream(true);
        Process process = builder.start();
        ByteArrayOutputStream log = new ByteArrayOutputStream();
        Thread reader = new Thread(() -> {
            try (InputStream output = process.getInputStream()) {
                byte[] buffer = new byte[4096];
                int count;
                while ((count = output.read(buffer)) != -1) {
                    log.write(buffer, 0, count);
                    if (log.size() > 48000) {
                        byte[] tail = log.toByteArray();
                        log.reset();
                        log.write(tail, tail.length - 24000, 24000);
                    }
                }
            } catch (Exception ignored) { }
        });
        reader.start();
        if (!process.waitFor(90, TimeUnit.SECONDS)) process.destroyForcibly();
        reader.join(2000);
        String details = new String(log.toByteArray(), StandardCharsets.UTF_8);
        android.util.Log.i("CompilerTrace", details);
        assertEquals(details, 0, process.exitValue());
    }
}
