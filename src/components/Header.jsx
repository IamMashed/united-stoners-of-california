import Navbar from 'react-bootstrap/Navbar';
import Container from 'react-bootstrap/Container';
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
      <Container>
        <Navbar.Brand as={Link} to="/">
          <span aria-hidden="true">🌿</span> United Stoners of California
        </Navbar.Brand>
        <Nav>
          {user === undefined ?
            <Spinner animation="border" variant="light" size="sm" />
          :
            <>
              {user !== null ?
                <NavDropdown title={<Avatar user={user} size={32} />} align="end"
                  id="account-menu">
                  <NavDropdown.Item as={NavLink} to={'/user/' + user.username}>
                    Profile
                  </NavDropdown.Item>
                  <NavDropdown.Divider />
                  {user.providers.includes('email') &&
                    <NavDropdown.Item as={NavLink} to="/password">
                      Change Password
                    </NavDropdown.Item>
                  }
                  <NavDropdown.Item onClick={logout}>Logout</NavDropdown.Item>
                </NavDropdown>
              :
                <>
                  <Nav.Link as={NavLink} to="/login">Login</Nav.Link>
                  <Nav.Link as={NavLink} to="/register">Register</Nav.Link>
                </>
              }
            </>
          }
        </Nav>
      </Container>
    </Navbar>
  );
}
