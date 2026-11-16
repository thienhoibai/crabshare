import java.util.Properties
import java.util.Base64
import java.net.URI

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val signingProperties = Properties().apply {
    val propertiesFile = rootProject.file("key.properties")
    if (propertiesFile.exists()) propertiesFile.inputStream().use { load(it) }
}
fun signingValue(name: String, environment: String): String? =
    System.getenv(environment)?.takeIf { it.isNotBlank() } ?: signingProperties.getProperty(name)
val releaseStore = signingValue("storeFile", "CRABSHARE_KEYSTORE_PATH")
val releaseStorePassword = signingValue("storePassword", "CRABSHARE_STORE_PASSWORD")
val releaseAlias = signingValue("keyAlias", "CRABSHARE_KEY_ALIAS")
val releaseKeyPassword = signingValue("keyPassword", "CRABSHARE_KEY_PASSWORD")
val hasReleaseSigning = listOf(releaseStore, releaseStorePassword, releaseAlias, releaseKeyPassword).all { !it.isNullOrBlank() }
val allowLocalRelease = System.getenv("CRABSHARE_ALLOW_LOCAL_RELEASE") == "true"

val validateReleaseConfiguration = tasks.register("validateReleaseConfiguration") {
    doLast {
        if (!hasReleaseSigning && !allowLocalRelease)
            throw GradleException("Release signing is required. Configure private key.properties or CRABSHARE signing environment variables. See docs/demo-app.md.")
        if (!allowLocalRelease) {
            val defines = (project.findProperty("dart-defines") as? String).orEmpty().split(',')
                .filter { it.isNotBlank() }.map { String(Base64.getDecoder().decode(it), Charsets.UTF_8) }
                .mapNotNull { value -> value.indexOf('=').takeIf { it > 0 }?.let { value.substring(0, it) to value.substring(it + 1) } }.toMap()
            for (name in listOf("API_URL", "WEB_URL")) {
                val address = runCatching { URI(defines[name].orEmpty()) }.getOrNull()
                if (address?.scheme != "https" || address.host.isNullOrBlank() || address.userInfo != null
                    || address.query != null || address.fragment != null || address.path !in listOf("", "/"))
                    throw GradleException("$name must be an explicit HTTPS origin for a demo release.")
            }
        }
    }
}
tasks.matching { it.name == "preReleaseBuild" }.configureEach { dependsOn(validateReleaseConfiguration) }

android {
    namespace = "vn.crabshare.crabshare_mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "vn.crabshare.crabshare_mobile"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseSigning) create("release") {
            storeFile = rootProject.file(releaseStore!!)
            storePassword = releaseStorePassword
            keyAlias = releaseAlias
            keyPassword = releaseKeyPassword
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName(if (hasReleaseSigning) "release" else "debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
