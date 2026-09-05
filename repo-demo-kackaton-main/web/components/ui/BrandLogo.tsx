'use client'

export default function BrandLogo() {
  return (
    <div className="flex max-w-full items-center gap-2">
      <img
        src="/images/logo.png"
        alt="Scapder"
        className="h-auto w-40 max-w-full object-contain sm:w-40 md:w-60"
      />
    </div>
  )
}