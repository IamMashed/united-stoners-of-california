import Container from 'react-bootstrap/Container';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import FlashProvider from './contexts/FlashProvider';
import ApiProvider from './contexts/ApiProvider';
import UserProvider from './contexts/UserProvider';
import Header from './components/Header';
import Footer from './components/Footer';
import PublicRoute from './components/PublicRoute';
import PrivateRoute from './components/PrivateRoute';
import HomePage from './pages/HomePage';
import UserPage from './pages/UserPage';
import PostPage from './pages/PostPage';
import EditUserPage from './pages/EditUserPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import LoginPage from './pages/LoginPage';
import RegistrationPage from './pages/RegistrationPage';
import ResetRequestPage from './pages/ResetRequestPage';
import ResetPage from './pages/ResetPage';
import ContactPage from './pages/ContactPage';

export default function App({ supabase, api }) {
  return (
    <Container fluid className="App">
      <BrowserRouter>
        <FlashProvider>
          <ApiProvider client={supabase} api={api}>
            <UserProvider>
              <Header />
              <Routes>
                {/* Anyone can read */}
                <Route path="/" element={<HomePage />} />
                <Route path="/post/:id" element={<PostPage />} />
                <Route path="/user/:username" element={<UserPage />} />

                {/* Logged-out only */}
                <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
                <Route path="/register" element={<PublicRoute><RegistrationPage /></PublicRoute>} />
                <Route path="/reset-request" element={<PublicRoute><ResetRequestPage /></PublicRoute>} />
                {/* Neither public nor private: the reset link logs the user in. */}
                <Route path="/reset" element={<ResetPage />} />

                {/* Logged-in only */}
                <Route path="/edit" element={<PrivateRoute><EditUserPage /></PrivateRoute>} />
                <Route path="/password" element={<PrivateRoute><ChangePasswordPage /></PrivateRoute>} />
                <Route path="/contact" element={<PrivateRoute><ContactPage /></PrivateRoute>} />

                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
              <Footer />
            </UserProvider>
          </ApiProvider>
        </FlashProvider>
      </BrowserRouter>
    </Container>
  );
}
