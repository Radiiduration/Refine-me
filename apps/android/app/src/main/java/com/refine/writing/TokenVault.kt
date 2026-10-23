package com.refine.writing

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal object TokenVault {
    private const val PREFS = "refine"
    private const val KEY_ALIAS = "refine_device_token_v1"
    private const val ENCRYPTED = "token_ciphertext"
    private const val IV = "token_iv"

    fun read(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val ciphertext = prefs.getString(ENCRYPTED, null)
        val iv = prefs.getString(IV, null)
        if (ciphertext != null && iv != null) return runCatching {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
            String(cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP)), Charsets.UTF_8)
        }.getOrDefault("")

        // Migrate tokens saved by earlier builds, then remove the plaintext copy.
        val legacy = prefs.getString("token", null).orEmpty()
        if (legacy.isNotEmpty()) write(context, legacy)
        return legacy
    }

    fun write(context: Context, token: String): Boolean {
        if (token.isEmpty()) {
            return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .remove(ENCRYPTED).remove(IV).remove("token").commit()
        }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = Base64.encodeToString(cipher.doFinal(token.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(ENCRYPTED, encrypted).putString(IV, iv).remove("token").commit()
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build())
        return generator.generateKey()
    }
}
