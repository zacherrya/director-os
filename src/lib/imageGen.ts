import { fetch } from '@tauri-apps/plugin-http'
import type { Episode, Scene } from './types'
import { getOpenAiKey } from './credentials'
import { recordAiUse } from './aiUsage'

export { getOpenAiKey, setOpenAiKey, hasOpenAiKey } from './credentials'

function sizeForFormat(format: Episode['format']): '1024x1536' | '1536x1024' | '1024x1024' {
  if (format === '9:16') return '1024x1536'
  if (format === '16:9') return '1536x1024'
  return '1024x1024'
}

function buildPrompt(scene: Scene): string {
  const cam = scene.camera
  const parts = [
    `Cinematic still frame from a short-form video, for a scene whose purpose is "${scene.purpose}" and whose mood is ${scene.emotion.toLowerCase()}.`,
    scene.visual ? `Visual description: ${scene.visual}.` : scene.dialogue ? `Scene context: ${scene.dialogue}.` : '',
    `Shot as a ${cam.shotType.toLowerCase()} at ${cam.angle.toLowerCase()}, ${cam.movement.toLowerCase()} camera movement, ${cam.lens} lens.`,
    cam.notes ? `Additional direction: ${cam.notes}.` : '',
    'Photorealistic, natural lighting, high production value. No text, no captions, no watermarks in the image.',
  ]
  return parts.filter(Boolean).join(' ')
}

export async function generateSceneImage(scene: Scene, episode: Episode): Promise<string> {
  const key = getOpenAiKey()
  if (!key) throw new Error('No OpenAI API key configured. Add one in Settings.')

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: buildPrompt(scene),
      size: sizeForFormat(episode.format),
      quality: 'medium',
      n: 1,
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = body?.error?.message as string | undefined
    if (res.status === 401) throw new Error('OpenAI rejected the API key. Check it in Settings.')
    if (res.status === 429) throw new Error(message || 'Rate limit or quota exceeded on your OpenAI account.')
    throw new Error(message || `Image generation failed (${res.status}).`)
  }

  recordAiUse('image')
  const json = await res.json()
  const b64 = json?.data?.[0]?.b64_json as string | undefined
  if (!b64) throw new Error('OpenAI returned no image data.')
  return `data:image/png;base64,${b64}`
}
