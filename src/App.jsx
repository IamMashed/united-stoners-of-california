import Container from 'react-bootstrap/Container';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import FlashProvider from './contexts/FlashProvider';
import ApiProvider from './contexts/ApiProvider';
import UserProvider from './contexts/UserProvider';
import Header from './components/Header';
import PublicRoute from './components/PublicRoute';
import PrivateRoute from './components/PrivateRoute';
import FeedPage from './pages/FeedPage';
import ExplorePage from './pages/ExplorePage';
import UserPage from './pages/UserPage';
import PostPage from './pages/PostPage';
import EditUserPage from './pages/EditUserPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import LoginPage from './pages/LoginPage';
import RegistrationPage from './pages/RegistrationPage';
import ResetRequestPage from './pages/ResetRequestPage';
import ResetPage from './pages/ResetPage';

export default function App({ supabase, api }) {
  return (
    <Container fluid className="App">
      <BrowserRouter>
        <FlashProvider>
          <ApiProvider client={supabase} api={api}>
            <UserProvider>
              <Header />
              <Routes>
                <Route path="/login" element={
                  <PublicRoute><LoginPage /></PublicRoute>
                } />
                <Route path="/register" element={
                  <PublicRoute><RegistrationPage /></PublicRoute>
                } />
                <Route path="/reset-request" element={
                  <PublicRoute><ResetRequestPage /></PublicRoute>
                } />
                {/* Neither public nor private: the reset link logs the user in. */}
                <Route path="/reset" element={<ResetPage />} />
                <Route path="*" element={
                  <PrivateRoute>
                    <Routes>
                      <Route path="/" element={<FeedPage />} />
                      <Route path="/explore" element={<ExplorePage />} />
                      <Route path="/user/:username" element={<UserPage />} />
                      <Route path="/post/:id" element={<PostPage />} />
                      <Route path="/edit" element={<EditUserPage />} />
                      <Route path="/password" element={<ChangePasswordPage />} />
                      <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                  </PrivateRoute>
                } />
              </Routes>
            </UserProvider>
          </ApiProvider>
        </FlashProvider>
      </BrowserRouter>
    </Container>
  );
}
