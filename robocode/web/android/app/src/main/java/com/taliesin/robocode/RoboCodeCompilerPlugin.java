package com.taliesin.robocode;

import android.content.Context;
import android.os.Build;
import android.system.Os;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Runs the bundled ESP32 cross compiler. No PC, network service, or other app is involved. */
@CapacitorPlugin(name = "RoboCodeCompiler")
public class RoboCodeCompilerPlugin extends Plugin {
    private static final String ASSET = "compiler/esp32.zip";
    private static final int MAX_SKETCH_BYTES = 64 * 1024;
    private static final int MAX_LOG_CHARS = 30_000;
    private static final long MAX_BUNDLE_BYTES = 768L * 1024 * 1024;
    private static final long STAGE_TIMEOUT_SECONDS = 180;
    private static final List<String> TOOLS = Arrays.asList(
        "librc_cc1plus.so", "librc_as.so", "librc_ld.so"
    );
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile Process activeProcess;

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        String problem = availabilityProblem(getContext());
        result.put("available", problem == null);
        result.put("busy", busy.get());
        result.put("abi", Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "unknown");
        result.put("message", problem == null ? "The phone compiler is included in this APK." : problem);
        call.resolve(result);
    }

    @PluginMethod
    public void compile(PluginCall call) {
        String sketch = call.getString("sketch", "");
        if (sketch.trim().isEmpty() || sketch.getBytes(StandardCharsets.UTF_8).length > MAX_SKETCH_BYTES) {
            call.reject("The sketch must contain code and be no larger than 64 KB.");
            return;
        }
        if (!busy.compareAndSet(false, true)) {
            call.reject("A compilation is already running. Wait for it to finish.");
            return;
        }
        worker.execute(() -> {
            try {
                call.resolve(compileSketch(getContext(), sketch, this::progress));
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "The phone compiler failed." : error.getMessage());
            } finally {
                busy.set(false);
            }
        });
    }

    private void progress(String message) {
        JSObject event = new JSObject();
        event.put("message", message);
        notifyListeners("compilerProgress", event);
    }

    interface Progress {
        void update(String message);
    }

    static String availabilityProblem(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return "The bundled phone compiler requires Android 8.0 or newer.";
        }
        File nativeDirectory = new File(context.getApplicationInfo().nativeLibraryDir);
        if (!new File(nativeDirectory, "librc_loader.so").isFile()) {
            return "This APK does not include a compiler for this phone's processor. Install the APK with the bundled compiler.";
        }
        for (String tool : TOOLS) {
            if (!new File(nativeDirectory, tool).isFile()) return "The APK compiler is incomplete: " + tool;
        }
        try (InputStream ignored = context.getAssets().open(ASSET)) {
            return null;
        } catch (IOException error) {
            return "The ESP32 compiler data is missing from this APK. Rebuild it with the compiler bundle.";
        }
    }

    JSObject compileSketch(Context context, String sketch, Progress progress) throws Exception {
        String problem = availabilityProblem(context);
        if (problem != null) throw new IOException(problem);
        progress.update("Preparing the phone compiler…");
        File bundle = prepareBundle(context);
        JSONObject manifest = new JSONObject(new String(readBounded(new File(bundle, "manifest.json"), 1024 * 1024), StandardCharsets.UTF_8));
        String profileId = manifest.getString("id");
        File nativeDirectory = new File(context.getApplicationInfo().nativeLibraryDir);
        File runtime = prepareRuntime(context, nativeDirectory, manifest);
        File jobs = new File(context.getCacheDir(), "compiler-jobs");
        ensureDirectory(jobs);
        File job = new File(jobs, "job-" + Long.toUnsignedString(System.nanoTime()));
        ensureDirectory(job);
        StringBuilder log = new StringBuilder();
        try {
            // Blockly already emits declarations and Arduino.h; preserve its generated C++ verbatim.
            try (FileOutputStream output = new FileOutputStream(new File(job, "sketch.cpp"))) {
                output.write(sketch.getBytes(StandardCharsets.UTF_8));
            }
            JSONArray stages = manifest.getJSONArray("stages");
            if (stages.length() != 3) throw new IOException("The compiler profile must contain three build stages.");
            String[] messages = { "Compiling your Arduino code…", "Assembling ESP32 instructions…", "Linking the ESP32 firmware…" };
            for (int i = 0; i < stages.length(); i++) {
                JSONObject stage = stages.getJSONObject(i);
                String tool = stage.getString("tool");
                if (!TOOLS.get(i).equals(tool)) throw new IOException("Unexpected compiler stage: " + tool);
                List<String> command = new ArrayList<>();
                command.add(new File(nativeDirectory, "librc_loader.so").getAbsolutePath());
                command.add("--library-path");
                command.add(runtime.getAbsolutePath() + ":" + nativeDirectory.getAbsolutePath());
                command.add(new File(nativeDirectory, tool).getAbsolutePath());
                JSONArray arguments = stage.getJSONArray("args");
                for (int n = 0; n < arguments.length(); n++) {
                    command.add(expand(arguments.getString(n), bundle, job, nativeDirectory));
                }
                progress.update(messages[i]);
                runStage(command, job, log);
            }
            byte[] elf = readBounded(new File(job, "sketch.elf"), 32 * 1024 * 1024);
            if (elf.length < 52 || elf[0] != 0x7f || elf[1] != 'E' || elf[2] != 'L' || elf[3] != 'F') {
                throw new IOException("The compiler did not produce a valid ELF firmware file.");
            }
            JSObject result = new JSObject();
            result.put("elfBase64", Base64.encodeToString(elf, Base64.NO_WRAP));
            result.put("fqbn", manifest.getString("fqbn"));
            result.put("profileId", profileId);
            result.put("log", log.toString());
            result.put("sketchHash", sha256(sketch));
            result.put("segments", readBootSegments(bundle, manifest));
            progress.update("Phone compilation finished.");
            return result;
        } finally {
            deleteTree(job);
        }
    }

    private static String expand(String value, File bundle, File job, File nativeDirectory) throws IOException {
        String expanded = value.replace("${bundle}", bundle.getAbsolutePath())
            .replace("${job}", job.getAbsolutePath()).replace("${native}", nativeDirectory.getAbsolutePath());
        if (expanded.contains("${")) throw new IOException("The compiler profile contains an unknown path token.");
        return expanded;
    }

    void runStage(List<String> command, File job, StringBuilder log) throws Exception {
        ProcessBuilder builder = new ProcessBuilder(command).directory(job).redirectErrorStream(true);
        // Android's inherited linker settings must not leak into the isolated glibc runtime.
        builder.environment().remove("LD_PRELOAD");
        builder.environment().remove("LD_LIBRARY_PATH");
        builder.environment().remove("GLIBC_LD_PRELOAD");
        builder.environment().remove("GLIBC_LD_LIBRARY_PATH");
        builder.environment().put("TMPDIR", job.getAbsolutePath());
        builder.environment().put("LC_ALL", "C");
        Process process = builder.start();
        activeProcess = process;
        Thread reader = new Thread(() -> {
            try (InputStream output = process.getInputStream()) {
                byte[] chunk = new byte[4096];
                int length;
                while ((length = output.read(chunk)) != -1) {
                    synchronized (log) {
                        log.append(new String(chunk, 0, length, StandardCharsets.UTF_8));
                        if (log.length() > MAX_LOG_CHARS) log.delete(0, log.length() - MAX_LOG_CHARS);
                    }
                }
            } catch (IOException ignored) {
                // Process termination closes the output stream.
            }
        }, "RoboCode-compiler-output");
        reader.start();
        try {
            if (!process.waitFor(STAGE_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                reader.join(2000);
                throw new IOException("Phone compilation took too long. Try again with a smaller program.");
            }
            reader.join(2000);
            if (process.exitValue() != 0) {
                String details;
                synchronized (log) { details = log.toString().trim(); }
                throw new IOException("Phone compilation failed in " + new File(command.get(3)).getName()
                    + " (" + process.exitValue() + ").\n" + details);
            }
        } finally {
            if (process.isAlive()) process.destroyForcibly();
            activeProcess = null;
        }
    }

    private static File prepareBundle(Context context) throws Exception {
        long update = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).lastUpdateTime;
        File root = new File(context.getNoBackupFilesDir(), "compiler");
        ensureDirectory(root);
        File destination = new File(root, "esp32-" + update);
        if (new File(destination, ".ready").isFile()) return destination;
        File staging = new File(root, "extract-" + update);
        deleteTree(staging);
        ensureDirectory(staging);
        try (ZipInputStream zip = new ZipInputStream(context.getAssets().open(ASSET))) {
            long total = 0;
            int entries = 0;
            byte[] buffer = new byte[32 * 1024];
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (++entries > 50_000) throw new IOException("The compiler bundle contains too many files.");
                File target = safeChild(staging, entry.getName());
                if (entry.isDirectory()) {
                    ensureDirectory(target);
                } else {
                    ensureDirectory(target.getParentFile());
                    try (FileOutputStream output = new FileOutputStream(target)) {
                        int count;
                        while ((count = zip.read(buffer)) != -1) {
                            total += count;
                            if (total > MAX_BUNDLE_BYTES) throw new IOException("The compiler bundle is too large.");
                            output.write(buffer, 0, count);
                        }
                    }
                }
                zip.closeEntry();
            }
            if (!new File(staging, "manifest.json").isFile()) throw new IOException("The compiler bundle has no profile manifest.");
            deleteTree(destination);
            if (!staging.renameTo(destination)) throw new IOException("Could not finish installing the compiler data.");
            if (!new File(destination, ".ready").createNewFile()) throw new IOException("Could not mark the compiler data ready.");
        } finally {
            deleteTree(staging);
        }
        File[] previousBundles = root.listFiles();
        if (previousBundles != null) {
            for (File previous : previousBundles) {
                if (!previous.equals(destination) && previous.getName().matches("esp32-[0-9]+")) deleteTree(previous);
            }
        }
        return destination;
    }

    private static File prepareRuntime(Context context, File nativeDirectory, JSONObject manifest) throws Exception {
        File runtime = new File(context.getCacheDir(), "compiler-runtime");
        ensureDirectory(runtime);
        Map<String, String> mappings = new LinkedHashMap<>();
        mappings.put("libc.so.6", "librc_c.so");
        mappings.put("libm.so.6", "librc_m.so");
        mappings.put("libgcc_s.so.1", "librc_gcc_s.so");
        mappings.put("libstdc++.so.6", "librc_stdcxx.so");
        mappings.put("libpthread.so.0", "librc_pthread.so");
        mappings.put("libdl.so.2", "librc_dl.so");
        mappings.put("librt.so.1", "librc_rt.so");
        mappings.put("ld-linux-aarch64.so.1", "librc_loader.so");
        JSONObject configured = manifest.optJSONObject("nativeLibraries");
        if (configured != null) {
            java.util.Iterator<String> keys = configured.keys();
            while (keys.hasNext()) {
                String soname = keys.next();
                mappings.put(soname, configured.getString(soname));
            }
        }
        for (Map.Entry<String, String> mapping : mappings.entrySet()) {
            if (!mapping.getKey().matches("[A-Za-z0-9_.+-]+") || !mapping.getValue().matches("librc_[A-Za-z0-9_]+\\.so")) {
                throw new IOException("Invalid compiler runtime library name.");
            }
            File packaged = new File(nativeDirectory, mapping.getValue());
            if (!packaged.isFile()) continue;
            File alias = new File(runtime, mapping.getKey());
            // delete() also removes a dangling link left after an APK update.
            alias.delete();
            if (alias.exists()) throw new IOException("Could not refresh a compiler library.");
            Os.symlink(packaged.getAbsolutePath(), alias.getAbsolutePath());
        }
        return runtime;
    }

    private static JSArray readBootSegments(File bundle, JSONObject manifest) throws Exception {
        JSONArray configured = manifest.optJSONArray("segments");
        if (configured == null) {
            configured = new JSONArray("[{\"name\":\"bootloader\",\"filename\":\"bootloader.bin\",\"address\":4096},{\"name\":\"partitions\",\"filename\":\"partitions.bin\",\"address\":32768},{\"name\":\"OTA selector\",\"filename\":\"boot_app0.bin\",\"address\":57344}]");
        }
        JSArray segments = new JSArray();
        for (int i = 0; i < configured.length(); i++) {
            JSONObject source = configured.getJSONObject(i);
            String filename = source.getString("filename");
            JSObject segment = new JSObject();
            segment.put("name", source.optString("name", filename));
            segment.put("filename", filename);
            segment.put("address", source.getInt("address"));
            segment.put("base64", Base64.encodeToString(readBounded(safeChild(bundle, filename), 1024 * 1024), Base64.NO_WRAP));
            segments.put(segment);
        }
        return segments;
    }

    static File safeChild(File directory, String name) throws IOException {
        File child = new File(directory, name);
        String prefix = directory.getCanonicalPath() + File.separator;
        if (name.isEmpty() || name.contains("\\") || new File(name).isAbsolute() || !child.getCanonicalPath().startsWith(prefix)) {
            throw new IOException("Invalid path in the compiler bundle.");
        }
        return child;
    }

    private static byte[] readBounded(File file, int maximum) throws IOException {
        if (!file.isFile() || file.length() > maximum) throw new IOException("Missing or oversized compiler output: " + file.getName());
        try (InputStream input = new FileInputStream(file); ByteArrayOutputStream result = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (result.size() + count > maximum) throw new IOException("Compiler output is too large.");
                result.write(buffer, 0, count);
            }
            return result.toByteArray();
        }
    }

    private static String sha256(String source) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8));
        StringBuilder hash = new StringBuilder();
        for (byte value : digest) hash.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
        return hash.substring(0, 12);
    }

    private static void ensureDirectory(File directory) throws IOException {
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Could not create the compiler working folder.");
    }

    private static void deleteTree(File file) throws IOException {
        if (!file.exists()) return;
        // Never traverse a symbolic link when cleaning an app-owned compilation folder.
        File normalized = new File(file.getParentFile().getCanonicalFile(), file.getName());
        if (file.isDirectory() && normalized.getCanonicalFile().equals(normalized.getAbsoluteFile())) {
            File[] children = file.listFiles();
            if (children == null) throw new IOException("Could not clean the compiler working folder.");
            for (File child : children) deleteTree(child);
        }
        if (!file.delete()) throw new IOException("Could not clean the compiler working folder.");
    }

    @Override
    protected void handleOnDestroy() {
        Process process = activeProcess;
        if (process != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) process.destroyForcibly();
        worker.shutdownNow();
    }
}
