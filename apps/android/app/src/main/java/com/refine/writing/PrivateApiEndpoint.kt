package com.refine.writing

import java.net.URL

internal object PrivateApiEndpoint {
    fun normalize(value: String): String? = runCatching {
        val candidate = value.trim().trimEnd('/')
        val url = URL(candidate)
        if (url.protocol != "https" || url.userInfo != null || url.query != null || url.ref != null) {
            return null
        }
        val host = url.host.lowercase()
        val privateHost = host == "localhost" || host.endsWith(".local") || isPrivateIPv4(host)
        candidate.takeIf { privateHost }
    }.getOrNull()

    private fun isPrivateIPv4(host: String): Boolean {
        val segments = host.split('.')
        if (segments.size != 4) return false
        val octets = segments.map { it.toIntOrNull() ?: return false }
        if (octets.any { it !in 0..255 }) return false
        return octets[0] == 10 || octets[0] == 192 && octets[1] == 168 ||
            octets[0] == 172 && octets[1] in 16..31
    }
}
