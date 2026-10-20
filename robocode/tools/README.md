# Bundled Android compiler tools

The Android compiler build uses a fixed classic ESP32 profile. Executable tools
are packaged in the APK's native library directory; headers and ESP32 libraries
are stored in the compiler asset bundle. End users do not need a PC or Termux.

## Build prerequisites

The developer machine needs Arduino CLI with Arduino-ESP32 **3.3.12** and its
**esp-x32 2601** toolchain installed, Python 3.11+ on Windows, and WSL/Linux with
Python 3.12+, `dpkg-deb`, `readelf`, `qemu-aarch64`, `build-essential`, `bison`,
and `gawk`. The APK build needs the
existing Android SDK and Java 21. These are developer tools, not phone requirements.

1. From `robocode`, prepare the reference core and data:

   ```powershell
   python tools/prepare-compiler-reference.py --cli C:\work\local\tools\arduino-cli\arduino-cli.exe --config C:\work\local\tools\arduino-cli\arduino-cli.yaml
   ```

2. Build the private x86-64 emulator runtime, then run the packager in WSL:

   ```powershell
   wsl python3 /mnt/c/work/local/IoT-Projects/robocode/tools/build-emulator-glibc.py
   wsl python3 /mnt/c/work/local/IoT-Projects/robocode/tools/prepare-android-compiler.py
   ```

   The script currently uses this workstation's Arduino data directory near its
   top; update `DATA` when building on another machine. Downloads are cached in
   `.compiler-cache`; Linux-native extraction lives under
   `~/.cache/robocode-compiler-esp-2601` for build performance.

3. From `web`, run `npm run android:sync`, then build with Android Studio or run
   `gradlew.bat :app:assembleDebug` from `web/android` using Java 21.

4. With an emulator connected, run
   `gradlew.bat :app:connectedDebugAndroidTest`. The `:app:` prefix deliberately
   selects RoboCode's tests rather than the dependency projects' own test apps.

The packager uses Espressif's published download checksums, Debian's package
checksums for supporting host libraries, and `android-glibc.lock.json` for the
Android-adapted runtime. It bundles available third-party license notices with
the compiler data. The runtime is a library dependency from the Termux glibc
project, not a companion app or a dependency on an installed Termux directory.

If a package mirror blocks Python downloads on a workstation, download the
exact URL listed in the lock file to `.compiler-cache` using the workstation's
normal downloader. The packager still verifies its pinned SHA-256 before use.

The x86-64 runtime is built from verified GNU glibc source, with the pinned
upstream Android thread patch and `glibc-x86_64-android.patch`. It stays in the
build cache and never replaces the workstation's system libraries. The local
patch replaces legacy file-operation syscalls blocked by Android with supported equivalents.
ARM64 uses the pinned upstream Android-adapted library package.

Optional startup tracing uses `tools/prepare-compiler-diagnostics.py` and the
`-PwithCompilerDiagnostics` Gradle property. Run `:app:connectedDebugAndroidTest`
with `-Pandroid.testInstrumentationRunnerArguments.class=com.taliesin.robocode.CompilerDiagnosticTest`
and `-Pandroid.testInstrumentationRunnerArguments.traceCompiler=true`.
Add `-Pandroid.testInstrumentationRunnerArguments.traceLinker=true` to trace a
full linker invocation, or also `-Pandroid.testInstrumentationRunnerArguments.traceInvalidLink=true`
to inspect undefined-function error cleanup. The latter intentionally returns a
nonzero compiler exit status and the diagnostic assertion prints the trace.
The diagnostic test skips by default; ordinary APK builds exclude its native tools.

Both native-tool smoke builds must pass before the asset ZIP is created. Do not
substitute the developer host's loader for the bundled runtime: absolute loader
symlinks in extracted Linux packages can point outside the package directory.
