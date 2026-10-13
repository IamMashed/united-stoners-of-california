import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';
import NavDropdown from 'react-bootstrap/NavDropdown';
import Spinner from 'react-bootstrap/Spinner';
import { Link, NavLink } from 'react-router-dom';
import { useUser } from '../contexts/UserProvider';
import Avatar from './Avatar';

export default function Header() {
  const { user, logout } = useUser();

  return (
    <Navbar sticky="top" className="Header" data-bs-theme="dark">
      <div className="Header-inner">
        <Navbar.Brand as={Link} to="/" className="Brand">
          <span className="Brand-leaf" aria-hidden="true">🌿</span>
          <span className="Brand-text">
            <span className="Brand-name">United Stoners</span>
            <span className="Brand-sub">of California</span>
          </span>
        </Navbar.Brand>
        <Nav className="Header-actions">
          {user === undefined ?
            <Spinner animation="border" variant="light" size="sm" />
          : user !== null ?
            <NavDropdown title={<Avatar user={user} size={34} />} align="end" id="account-menu">
              <NavDropdown.Item as={NavLink} to={'/user/' + user.username}>Profile</NavDropdown.Item>
              <NavDropdown.Item as={NavLink} to="/edit">Edit profile</NavDropdown.Item>
              {user.providers.includes('email') &&
                <NavDropdown.Item as={NavLink} to="/password">Change password</NavDropdown.Item>
              }
              <NavDropdown.Divider />
              <NavDropdown.Item onClick={logout}>Logout</NavDropdown.Item>
            </NavDropdown>
          :
            <>
              <NavLink to="/login" className="btn btn-sm btn-outline-light Header-btn">Login</NavLink>
              <NavLink to="/register" className="btn btn-sm btn-warning Header-btn">Join</NavLink>
            </>
          }
        </Nav>
      </div>
      <p className="Header-slogan">Stoners of the world, Unite!</p>
    </Navbar>
  );
}
