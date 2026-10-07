plugins {
 id("com.android.application")
 id("org.jetbrains.kotlin.android")
 id("org.jetbrains.kotlin.plugin.compose")
 id("org.jetbrains.kotlin.kapt")
}
android {
 namespace = "io.qube.companion"
 compileSdk = 35
 defaultConfig { applicationId = "io.qube.companion"; minSdk = 26; targetSdk = 35; versionCode = 2; versionName = "0.2.0"; ndk { abiFilters += "arm64-v8a" } }
 signingConfigs {
  if (System.getenv("QUBE_ANDROID_KEYSTORE") != null) {
   create("qubeRelease") {
    storeFile = file(System.getenv("QUBE_ANDROID_KEYSTORE"))
    storeType = "PKCS12"
    storePassword = System.getenv("QUBE_ANDROID_STORE_PASSWORD")
    keyAlias = "qube"
    keyPassword = System.getenv("QUBE_ANDROID_STORE_PASSWORD")
   }
  }
 }
 buildTypes { getByName("release") { signingConfig = signingConfigs.findByName("qubeRelease") } }
 buildFeatures { compose = true; buildConfig = true }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget = "17" }
 packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}
dependencies {
 implementation(platform("androidx.compose:compose-bom:2025.04.01"))
 implementation("androidx.activity:activity-compose:1.10.1")
 implementation("androidx.compose.material3:material3")
 implementation("androidx.compose.ui:ui")
 implementation("androidx.compose.ui:ui-tooling-preview")
 implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.0")
 implementation("androidx.room:room-runtime:2.7.1")
 implementation("androidx.room:room-ktx:2.7.1")
 kapt("androidx.room:room-compiler:2.7.1")
 implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
 implementation("com.squareup.okhttp3:okhttp:4.12.0")
 implementation("com.journeyapps:zxing-android-embedded:4.3.0")
 implementation(files("libs/sherpa-onnx-1.13.8.aar"))
 testImplementation("junit:junit:4.13.2")
}
