export default function AppHeader({ user, logout, retailer, site, goHome }) {
  return (
    <header className="app-header">
      <button className="brand brand-button" onClick={goHome}><span className="brand-mark">S</span><span>SCAPDER<small>SPATIAL OS</small></span></button>
      <nav className="breadcrumbs"><button onClick={goHome}>Retailers</button>{retailer && <><i>/</i><span>{retailer.name}</span></>}{site && <><i>/</i><span>{site.name}</span></>}</nav>
      <div className="user-chip"><span>{user.name}<small>{user.role}</small></span><button onClick={logout} aria-label="Cerrar sesión">↗</button></div>
    </header>
  )
}