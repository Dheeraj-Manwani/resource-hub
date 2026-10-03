"use client"

import Lightbox from "yet-another-react-lightbox"
import Captions from "yet-another-react-lightbox/plugins/captions"
import Zoom from "yet-another-react-lightbox/plugins/zoom"
import "yet-another-react-lightbox/styles.css"
import "yet-another-react-lightbox/plugins/captions.css"

export type LightboxSlide = {
  src: string
  title?: string
  description?: string
  width?: number
  height?: number
}

export default function LightboxImpl({
  slides,
  index,
  onClose,
  onIndexChange,
}: {
  slides: LightboxSlide[]
  index: number
  onClose: () => void
  onIndexChange: (index: number) => void
}) {
  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={slides}
      plugins={[Zoom, Captions]}
      on={{ view: ({ index: i }) => onIndexChange(i) }}
      zoom={{ maxZoomPixelRatio: 4, scrollToZoom: true }}
      captions={{ descriptionTextAlign: "center" }}
      controller={{ closeOnBackdropClick: true }}
      styles={{ container: { backgroundColor: "rgba(5,5,5,0.96)" } }}
    />
  )
}
