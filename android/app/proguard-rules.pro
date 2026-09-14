# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ─── Budget Watchdog: minifyEnabled=true icin gerekli keep kurallari ───

# Capacitor: JS koprusu reflection kullanir, plugin siniflari korunmali
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
}
-keep class com.getcapacitor.plugin.** { *; }
-keep class io.ionic.** { *; }

# capacitor-sqlite
-keep class com.getcapacitor.community.database.sqlite.** { *; }

# SQLCipher (androidIsEncryption=true) - native kopru, obfuscation'a dayanmaz
-keep class net.zetetic.** { *; }
-keep class net.sqlcipher.** { *; }

# EncryptedSharedPreferences / MasterKey (Tink tabanli) - DB passphrase deposu
-keep class androidx.security.crypto.** { *; }
-keep class com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**

# Biometric
-keep class androidx.biometric.** { *; }
