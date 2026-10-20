package com.taliesin.robocode;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.util.Base64;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSObject;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Arrays;

/** These tests execute the packaged compiler inside the Android app sandbox. */
@RunWith(AndroidJUnit4.class)
public class CompilerInstrumentedTest {
    @Test
    public void generatedSketchCompilesToXtensaElf() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertNull(RoboCodeCompilerPlugin.availabilityProblem(context));
        RoboCodeCompilerPlugin compiler = new RoboCodeCompilerPlugin();
        String sketch = "#include <Arduino.h>\nvoid setup(){pinMode(2, OUTPUT);}\n"
            + "void loop(){digitalWrite(2, HIGH);delay(317);digitalWrite(2, LOW);delay(683);}\n";
        JSObject result = compiler.compileSketch(context, sketch, message -> {});
        byte[] elf = Base64.decode(result.getString("elfBase64"), Base64.DEFAULT);
        assertTrue(elf.length > 1000);
        assertEquals(0x7f, elf[0]);
        assertEquals('E', elf[1]);
        assertEquals('L', elf[2]);
        assertEquals('F', elf[3]);
        assertEquals(1, elf[4]); // ELF32.
        assertEquals(1, elf[5]); // Little endian.
        assertEquals(94, elf[18] & 0xff); // EM_XTENSA.
        assertEquals(0, elf[19]);
        assertEquals("esp32:esp32:esp32", result.getString("fqbn"));
        assertNotNull(result.getString("sketchHash"));
        assertEquals(3, result.getJSONArray("segments").length());
        // Export this real Android compiler result for comparison with esptool.
        try (FileOutputStream output = new FileOutputStream(new File(context.getFilesDir(), "compiler-verification.elf"))) {
            output.write(elf);
        }
        File exportDirectory = context.getExternalFilesDir(null);
        if (exportDirectory != null) {
            try (FileOutputStream output = new FileOutputStream(new File(exportDirectory, "compiler-verification.elf"))) {
                output.write(elf);
            }
        }

        String secondSketch = "#include <Arduino.h>\n"
            + "void setup(){Serial.begin(115200);pinMode(2, OUTPUT);}\n"
            + "void loop(){for(int i=0;i<3;i++){digitalWrite(2,i%2);"
            + "Serial.println(i*i+17);delay(211);}}\n";
        JSObject second = compiler.compileSketch(context, secondSketch, message -> {});
        byte[] secondElf = Base64.decode(second.getString("elfBase64"), Base64.DEFAULT);
        assertTrue("Different C++ programs must produce different firmware", !Arrays.equals(elf, secondElf));
        assertTrue(!result.getString("sketchHash").equals(second.getString("sketchHash")));
    }

    @Test
    public void generatedI2cSketchCompilesToXtensaElf() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        RoboCodeCompilerPlugin compiler = new RoboCodeCompilerPlugin();
        String sketch = "#include <Arduino.h>\n#include <Wire.h>\n"
            + "void setup(){Wire.begin(21,22);}\nvoid loop(){}\n";
        JSObject result = compiler.compileSketch(context, sketch, message -> {});
        byte[] elf = Base64.decode(result.getString("elfBase64"), Base64.DEFAULT);
        assertTrue(elf.length > 1000);
        assertEquals(0x7f, elf[0]);
        assertEquals('E', elf[1]);
    }

    @Test
    public void compilerReportsInvalidSource() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        RoboCodeCompilerPlugin compiler = new RoboCodeCompilerPlugin();
        try {
            compiler.compileSketch(context, "#error ROBOCODE_INVALID_SOURCE_TEST\n", message -> {});
            fail("Invalid code must not return firmware.");
        } catch (IOException error) {
            assertTrue(error.getMessage().contains("ROBOCODE_INVALID_SOURCE_TEST"));
        }
    }

    @Test
    public void linkerReportsUndefinedFunction() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        RoboCodeCompilerPlugin compiler = new RoboCodeCompilerPlugin();
        try {
            compiler.compileSketch(context, "#include <Arduino.h>\nextern void ROBOCODE_MISSING_FUNCTION();\n"
                + "void setup(){ROBOCODE_MISSING_FUNCTION();}\nvoid loop(){}\n", message -> {});
            fail("An undefined function must not return firmware.");
        } catch (IOException error) {
            assertTrue(error.getMessage(), error.getMessage().contains("undefined reference"));
            assertTrue(error.getMessage(), error.getMessage().contains("ROBOCODE_MISSING_FUNCTION"));
            assertTrue(error.getMessage(), !error.getMessage().contains("(159)"));
        }
    }

    @Test
    public void bundlePathsCannotEscapeWorkingFolder() throws Exception {
        File root = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(), "path-check");
        for (String path : new String[] { "../outside", "/outside", "nested/../../outside", "..\\outside" }) {
            try {
                RoboCodeCompilerPlugin.safeChild(root, path);
                fail("Accepted unsafe bundle path: " + path);
            } catch (IOException expected) {
                assertTrue(expected.getMessage().contains("Invalid path"));
            }
        }
        assertEquals(new File(root, "include/Arduino.h").getCanonicalFile(),
            RoboCodeCompilerPlugin.safeChild(root, "include/Arduino.h").getCanonicalFile());
    }
}
