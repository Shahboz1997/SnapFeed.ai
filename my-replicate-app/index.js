import Replicate from 'replicate'
import dotenv from 'dotenv'
dotenv.config()

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
  userAgent: 'https://www.npmjs.com/package/create-replicate'
})
const model = 'xai/grok-imagine-image:3032db31147241f86351f0d7ab1ffd5150dcb482bcb873580f15d8cb8970a812'
const input = {
  prompt: 'A cinematic, ultra-detailed scene of a futuristic forest landscape at golden daylight. The setting is a lush, temperate forest resembling giant redwood groves, with massive reddish-brown tree trunks rising vertically out of a floor of ferns, moss, and low undergrowth. In the mid-ground, a gently sloping grassy hill is illuminated by warm sunlight filtering through the trees, creating soft patches of light and shadow. The air has a faint atmospheric haze, giving the distance a slightly misty, ethereal look.\n\nHovering silently about 3–6 meters above the ground are two sleek, oval, white anti-gravity pods shaped like smooth capsules. Each pod has a continuous panoramic window wrapping around the front half, tinted slightly green, revealing a soft interior glow and faint silhouettes of seating. The hulls are glossy and seamless, with subtle panel lines and minimalistic futuristic design. From the undersides of the pods hang small trailing plants and vines, suggesting a blend of advanced technology and ecological design. A faint bluish light or energy source is visible beneath each pod, indicating their hovering mechanism.\n\nIn the background, partially obscured by trees and mist, stands a tall futuristic tower with multiple circular platforms and vertical glowing blue light strips running up its structure, suggesting advanced architecture integrated into the forest.\n\nOn top of the right-side hovering pod stands a medieval girl, contrasting strongly with the futuristic setting. She appears about 16–20 years old, wearing a simple medieval dress made of natural fabrics—earth-toned linen or wool—with long sleeves and a fitted bodice, slightly wind-ruffled. Her hair is long and loose or braided, moving gently in the breeze created by the hovering craft. She stands carefully but confidently on the smooth surface, looking outward toward the landscape, her posture upright and curious, as if witnessing an unfamiliar world. The lighting on her matches the warm forest sunlight, with soft highlights and realistic shadows.\n\nOverlay text appears elegantly integrated into the scene: the words “grok imagine image” centered, displayed in a beautiful natural serif font, beige in color, refined and organic, positioned subtly within the composition (either centered or gently floating near the upper third of the frame). The typography is soft, sophisticated, and harmonious with the natural tones of the forest, with slight depth and gentle shadowing to blend into the cinematic environment.\n\nHighly detailed, photorealistic lighting, cinematic depth of field, natural color grading, soft atmospheric perspective, sharp foreground foliage, film grain',
  aspect_ratio: '1:1',
}

console.log('Using model: %s', model)
console.log('With input: %O', input)

console.log('Running...')
const output = await replicate.run(model, { input })
console.log('Done!', output)
