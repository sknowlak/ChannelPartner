import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../i18n/dataLabels';

export default function NavBar() {
  const { t } = useTranslation(['shell', 'team', 'common', 'data']);
  const { partner, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }) => (isActive ? 'active' : undefined);

  // System role names are translated for display; custom role names stay as typed.
  const roleText = partner?.roleName
    ? roleLabel(partner.roleName)
    : t(partner?.role === 'OWNER' ? 'team:roles.owner' : 'team:roles.member');

  return (
    <nav className="nav-bar" aria-label={t('shell:nav.mainNav')}>
      <span className="brand">{t('shell:nav.brandName')}<br />{t('shell:nav.brandSub')}</span>
      {partner ? (
        <>
          <NavLink to="/my-leads" className={linkClass}>{t('shell:nav.myLeads')}</NavLink>
          <NavLink to="/team" className={linkClass}>{t('shell:nav.manageTeam')}</NavLink>
          <NavLink to="/settings" className={linkClass}>{t('shell:nav.settings')}</NavLink>
          <span className="spacer" />
          <span className="who">{partner.name} · {roleText}</span>
          <button className="link" onClick={handleLogout}>{t('common:actions.logout')}</button>
        </>
      ) : (
        <>
          <NavLink to="/login" className={linkClass}>{t('shell:nav.login')}</NavLink>
          <NavLink to="/signup" className={linkClass}>{t('shell:nav.registerPartner')}</NavLink>
          <span className="spacer" />
          <NavLink to="/builder/login" className={linkClass}>{t('shell:nav.builderLogin')}</NavLink>
        </>
      )}
    </nav>
  );
}
