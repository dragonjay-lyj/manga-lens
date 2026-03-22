export class ImageResponse extends Response {
  constructor() {
    throw new Error(
      "ImageResponse is not available in this Cloudflare free-plan deployment because no OG image routes are configured.",
    )
  }
}

const vercelOgStub = {
  ImageResponse,
}

export default vercelOgStub
