# Streaming-link ingestion

Frasi accepts YouTube, YouTube Music, and Spotify links without pretending that their public
developer APIs expose downloadable audio. The public guest workflow is user-mediated:

1. Frasi validates the official HTTPS link and opens it in its native service.
2. The user starts playback, returns to Frasi, and chooses **Capture 20 seconds**.
3. The browser's own display-share picker asks which tab to share and whether tab audio is
   included.
4. Frasi records only the granted audio track into a bounded, in-memory `MediaRecorder` buffer.
5. The same local monophonic pitch/rhythm pipeline used for file uploads converts the buffer to
   reviewable MusicXML. The recording is never uploaded or written to persistent storage.

This design is deliberate. YouTube's API policies prohibit downloading, importing, caching, or
storing audiovisual content without prior written approval. Spotify's Web Playback SDK provides
encrypted playback control and metadata rather than raw PCM samples, and its policy requires
Spotify content to remain in its original form.

Consequently, “paste any link and have the backend rip the track” is not a supported or honest
product claim. Shared-tab capture works only when the browser, operating system, and source
platform provide an audio track. Protected playback may decline capture, and users must have the
right to transcribe the material.

Primary platform references:

- [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- [YouTube policy compliance guide](https://developers.google.com/youtube/terms/developer-policies-guide)
- [Spotify Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk)
- [Spotify Web Playback SDK reference and policy notes](https://developer.spotify.com/documentation/web-playback-sdk/reference)
