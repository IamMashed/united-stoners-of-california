import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { makeFakeApi, makePost, KUSH, HASH } from './test/fakeApi';

function renderAt(path, api) {
  window.history.pushState({}, '', path);
  return render(<App api={api} />);
}

describe('App', () => {
  test('logged-out visitors are sent to the login page', async () => {
    renderAt('/explore', makeFakeApi());

    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  test('logging in lands on the originally requested page', async () => {
    const api = makeFakeApi({ posts: [makePost(1, HASH, 'Rosin at 180F')] });
    renderAt('/explore', api);

    await userEvent.type(await screen.findByLabelText('Email address'), 'kushking@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Rosin at 180F')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/explore');
    expect(api.listPosts).toHaveBeenCalledWith({ kind: 'explore', authorId: undefined });
  });

  test('wrong password shows an error and stays on login', async () => {
    renderAt('/login', makeFakeApi());

    await userEvent.type(await screen.findByLabelText('Email address'), 'kushking@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  test('feed only offers Delete on the current user\'s own posts', async () => {
    const api = makeFakeApi({
      loggedInAs: KUSH,
      posts: [makePost(2, KUSH, 'My Mendo Purps', 0), makePost(1, HASH, 'Her hash tips', 3)],
    });
    renderAt('/', api);

    const mine = (await screen.findByText('My Mendo Purps')).closest('.Post');
    const theirs = screen.getByText('Her hash tips').closest('.Post');
    expect(within(mine).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(within(theirs).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(theirs).getByRole('link', { name: '3 comments' })).toHaveAttribute('href', '/post/1');
  });

  test('a new post appears at the top of the feed', async () => {
    const api = makeFakeApi({ loggedInAs: KUSH, posts: [makePost(1, HASH, 'Older post')] });
    renderAt('/', api);

    await screen.findByText('Older post');
    await userEvent.type(screen.getByPlaceholderText(/Share a strain/), 'Fresh drop from Humboldt');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    const bodies = (await screen.findAllByText(/Fresh drop|Older post/)).map((el) => el.textContent);
    expect(bodies).toEqual(['Fresh drop from Humboldt', 'Older post']);
    expect(api.createPost).toHaveBeenCalledWith('Fresh drop from Humboldt');
  });

  test('registration rejects a taken username without creating an account', async () => {
    const api = makeFakeApi();
    renderAt('/register', api);

    await userEvent.type(await screen.findByLabelText('Username'), 'HashQueen');
    await userEvent.type(screen.getByLabelText('Email address'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.type(screen.getByLabelText('Password again'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText('That username is already taken.')).toBeInTheDocument();
    expect(api.auth.signUp).not.toHaveBeenCalled();
  });

  test('successful registration asks the user to confirm their email', async () => {
    const api = makeFakeApi();
    renderAt('/register', api);

    await userEvent.type(await screen.findByLabelText('Username'), 'sativa_sam');
    await userEvent.type(screen.getByLabelText('Email address'), 'sam@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.type(screen.getByLabelText('Password again'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText(/Check your email to confirm/)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(api.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'sam@example.com',
      options: expect.objectContaining({ data: { username: 'sativa_sam' } }),
    }));
  });

  test('logout returns to the login page', async () => {
    renderAt('/', makeFakeApi({ loggedInAs: KUSH }));

    await userEvent.click(await screen.findByRole('button', { name: 'kushking' }));
    await userEvent.click(await screen.findByText('Logout'));

    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });
});
