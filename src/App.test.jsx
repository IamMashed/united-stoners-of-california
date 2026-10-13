import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { makeFakeApi, makePost, makeComment, KUSH, HASH } from './test/fakeApi';

function renderAt(path, api) {
  window.history.pushState({}, '', path);
  return render(<App api={api} />);
}

async function logIn(email) {
  await userEvent.type(await screen.findByLabelText('Email address'), email);
  await userEvent.type(screen.getByLabelText('Password'), 'password123');
  await userEvent.click(screen.getByRole('button', { name: 'Login' }));
}

const POSTS = [makePost(1, KUSH, 'Rosin at 180F', 2)];
const COMMENTS = [
  makeComment(10, 1, HASH, 'What micron bags?'),
  makeComment(11, 1, KUSH, '25u for full melt.'),
];

describe('reading (no login needed)', () => {
  test('visitors can read posts but get no compose box or delete buttons', async () => {
    renderAt('/', makeFakeApi({ posts: POSTS }));

    const post = (await screen.findByText('Rosin at 180F')).closest('.Post');
    expect(within(post).getByRole('link', { name: '2 comments' })).toHaveAttribute('href', '/post/1');
    expect(within(post).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByPlaceholderText(/Share a strain/)).toBeNull();
  });

  test('visitors can read comments and are invited to log in to reply', async () => {
    renderAt('/post/1', makeFakeApi({ posts: POSTS, comments: COMMENTS }));

    expect(await screen.findByText('What micron bags?')).toBeInTheDocument();
    expect(screen.getByText('25u for full melt.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: 'Comment' })).toBeNull();
  });

  test('logging in from a post returns to that post with the comment box', async () => {
    renderAt('/post/1', makeFakeApi({ posts: POSTS, comments: COMMENTS }));

    await userEvent.click(await screen.findByRole('link', { name: 'Log in' }));
    await logIn('hashqueen@example.com');

    expect(await screen.findByRole('button', { name: 'Comment' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/post/1');
  });

  test('private pages send visitors to login', async () => {
    renderAt('/edit', makeFakeApi());

    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });
});

describe('long posts', () => {
  const LONG = makePost(5, KUSH, Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`).join('\n'));

  test('are clamped on the home page with a Read more link to the full post', async () => {
    renderAt('/', makeFakeApi({ posts: [LONG, ...POSTS] }));

    const link = await screen.findByRole('link', { name: 'Read more' });
    expect(link).toHaveAttribute('href', '/post/5');
    expect(screen.getAllByRole('link', { name: 'Read more' })).toHaveLength(1);  // short post: none
  });

  test('are shown in full on their own page', async () => {
    renderAt('/post/5', makeFakeApi({ posts: [LONG] }));

    expect(await screen.findByText(/Line 12/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Read more' })).toBeNull();
  });
});

describe('posting is superuser-only', () => {
  test('regular members cannot post or delete posts', async () => {
    renderAt('/', makeFakeApi({ loggedInAs: HASH, posts: POSTS }));

    const post = (await screen.findByText('Rosin at 180F')).closest('.Post');
    expect(within(post).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByPlaceholderText(/Share a strain/)).toBeNull();
  });

  test('the superuser can publish a post with photos and it appears first', async () => {
    const api = makeFakeApi({ loggedInAs: KUSH, posts: POSTS });
    renderAt('/', api);

    await screen.findByText('Rosin at 180F');
    await userEvent.type(screen.getByPlaceholderText(/Share a strain/), 'Harvest day');
    const photo = new File(['x'], 'harvest.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByTestId('image-input'), photo);
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    const posts = await screen.findAllByText(/Harvest day|Rosin at 180F/);
    expect(posts.map((el) => el.textContent)).toEqual(['Harvest day', 'Rosin at 180F']);
    expect(api.createPost).toHaveBeenCalledWith({ body: 'Harvest day', files: [photo] });
    const newPost = posts[0].closest('.Post');
    expect(within(newPost).getByRole('img', { name: 'Photo 1' }))
      .toHaveAttribute('src', 'https://media.test/u-kush/harvest.jpg');
  });
});

describe('commenting', () => {
  test('members can only delete their own comments', async () => {
    renderAt('/post/1', makeFakeApi({ loggedInAs: HASH, posts: POSTS, comments: COMMENTS }));

    await screen.findByRole('button', { name: 'Comment' });  // user loaded
    const mine = screen.getByText('What micron bags?').closest('.Comment');
    const theirs = screen.getByText('25u for full melt.').closest('.Comment');
    expect(within(mine).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(within(theirs).queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  test('the superuser can delete any comment', async () => {
    renderAt('/post/1', makeFakeApi({ loggedInAs: KUSH, posts: POSTS, comments: COMMENTS }));

    await screen.findByRole('button', { name: 'Comment' });  // user loaded
    const theirs = screen.getByText('What micron bags?').closest('.Comment');
    expect(within(theirs).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  test('a comment with a YouTube link shows the link and an embedded player', async () => {
    const api = makeFakeApi({ loggedInAs: HASH, posts: [makePost(1, KUSH, 'Rosin at 180F', 0)] });
    renderAt('/post/1', api);

    await userEvent.type(await screen.findByPlaceholderText(/Add a comment/),
      'Watch this https://youtu.be/dQw4w9WgXcQ');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    const comment = (await screen.findByRole('link', { name: 'youtu.be/dQw4w9WgXcQ' })).closest('.Comment');
    expect(within(comment).getByTitle('youtube video'))
      .toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(screen.getByText('1 comment')).toBeInTheDocument();
  });

  test('non-image attachments are rejected before upload', async () => {
    const api = makeFakeApi({ loggedInAs: HASH, posts: POSTS, comments: [] });
    renderAt('/post/1', api);

    const pdf = new File(['x'], 'menu.pdf', { type: 'application/pdf' });
    await userEvent.upload(await screen.findByTestId('image-input'), pdf, { applyAccept: false });

    expect(await screen.findByText(/menu.pdf: only JPEG, PNG, WebP and GIF/)).toBeInTheDocument();
    expect(api.createComment).not.toHaveBeenCalled();
  });
});

describe('accounts', () => {
  test('wrong password shows an error and stays on login', async () => {
    renderAt('/login', makeFakeApi());

    await userEvent.type(await screen.findByLabelText('Email address'), 'kushking@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
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
    expect(api.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'sam@example.com',
      options: expect.objectContaining({ data: { username: 'sativa_sam' } }),
    }));
  });

  test('logout keeps the visitor on the readable site', async () => {
    renderAt('/', makeFakeApi({ loggedInAs: HASH, posts: POSTS }));

    await userEvent.click(await screen.findByRole('button', { name: 'hashqueen' }));
    await userEvent.click(await screen.findByText('Logout'));

    expect(await screen.findByRole('link', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByText('Rosin at 180F')).toBeInTheDocument();
  });
});
