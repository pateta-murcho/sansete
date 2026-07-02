import clsx from 'clsx'

const SIZES = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-4xl',
}

export default function Logo({ size = 'md', className }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <span className={clsx('font-black tracking-tight sunset-text', SIZES[size], className)}>
      Sonset
    </span>
  )
}
