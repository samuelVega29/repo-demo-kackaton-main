export default function PageShell({ children, wide = false }) {
  return (
    <section className={`mx-auto min-h-[calc(100vh-76px)] px-4 py-12 sm:px-6 lg:py-20 ${wide ? 'max-w-[1380px]' : 'max-w-7xl'}`}>
      {children}
    </section>
  )
}
