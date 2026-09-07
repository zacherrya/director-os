import { Icon } from './Icon'
import { PURPOSE_COLOR, type Scene } from '../lib/types'

export function SceneThumbnail({
  scene,
  showBadge = true,
  className = '',
}: {
  scene: Scene
  showBadge?: boolean
  className?: string
}) {
  const color = PURPOSE_COLOR[scene.purpose] ?? '#d3a75c'

  if (scene.image) {
    return (
      <div className={`relative shrink-0 overflow-hidden rounded-lg ${className}`}>
        <img src={scene.image} alt="" className="h-full w-full object-cover" />
        {showBadge && (
          <span
            className="absolute top-1.5 left-1.5 flex h-4 min-w-4 items-center justify-center rounded px-1 text-[9px] font-semibold text-white/90"
            style={{ backgroundColor: `${color}cc` }}
          >
            {scene.index}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg ${className}`}
      style={{
        background: `linear-gradient(155deg, ${color}3d 0%, ${color}14 55%, transparent 100%)`,
      }}
    >
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 10px)',
        }}
      />
      {showBadge && (
        <span
          className="absolute top-1.5 left-1.5 flex h-4 min-w-4 items-center justify-center rounded px-1 text-[9px] font-semibold text-white/90"
          style={{ backgroundColor: `${color}cc` }}
        >
          {scene.index}
        </span>
      )}
      <Icon name={scene.thumbnailIcon} size={20} className="opacity-70" style={{ color }} />
    </div>
  )
}
