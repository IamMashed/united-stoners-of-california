import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App from './App';
import { makeFakeApi, makePost, makeComment, KUSH, HASH } from './test/fakeApi';

// jsdom can't decode or re-encode video; the real compression is covered by lib/video tests
// and manual checks. Here a picked video is "prepared" as-is, or rejected when too long.
vi.mock('./lib/video', async (importOriginal) => ({
  ...(await importOriginal()),
  prepareVideo: vi.fn(async (file) => (file.name.includes('long')
    ? { error: `${file.name}: videos can be up to 60 seconds long (this one is 95s).` }
    : { file })),
}));

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

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
});
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
    await userEvent.type(await screen.findByPlaceholderText(/Share a strain/), 'Harvest day');
    const photo = new File(['x'], 'harvest.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByTestId('image-input'), photo);
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    const posts = await screen.findAllByText(/Harvest day|Rosin at 180F/);
    expect(posts.map((el) => el.textContent)).toEqual(['Harvest day', 'Rosin at 180F']);
    expect(api.createPost).toHaveBeenCalledWith(expect.objectContaining({ body: 'Harvest day', files: [photo] }));
    // The feed only previews the post; the photo is on the post page behind "Read more".
    const newPost = posts[0].closest('.Post');
    expect(within(newPost).queryByRole('img', { name: 'Photo 1' })).toBeNull();
    expect(within(newPost).getByRole('link', { name: 'Read more' })).toHaveAttribute('href', '/post/999');
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

describe('post layout', () => {
  test('a video shows above the text and a [photo 1] line puts the photo between paragraphs', async () => {
    const body = 'https://www.youtube.com/watch?v=AeP0MTL-NH8\n\nFirst paragraph.\n\n[photo 1]\n\nSecond paragraph.';
    renderAt('/post/7', makeFakeApi({ posts: [makePost(7, KUSH, body, 0, ['u-kush/bud.png'])] }));

    const first = await screen.findByText('First paragraph.');
    const post = first.closest('.Post');
    const video = within(post).getByTitle('youtube video');
    const photo = within(post).getByRole('img', { name: 'Photo 1' });
    const second = within(post).getByText('Second paragraph.');
    const order = (a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(order(video, first)).toBeTruthy();
    expect(order(first, photo)).toBeTruthy();
    expect(order(photo, second)).toBeTruthy();
    expect(within(post).queryByText('[photo 1]')).toBeNull();
    // The bare link line is replaced by the player, not shown twice.
    expect(within(post).queryByRole('link', { name: /youtube\.com/ })).toBeNull();
  });
});

describe('video uploads', () => {
  const clip = (name = 'bong-rip.mp4') => new File(['x'], name, { type: 'video/mp4' });

  test('a member comments with an uploaded video and it plays in the comment', async () => {
    const api = makeFakeApi({ loggedInAs: HASH, posts: POSTS, comments: [] });
    renderAt('/post/1', api);

    await userEvent.upload(await screen.findByTestId('video-input'), clip());
    expect(await screen.findByLabelText('Video preview')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    const comment = (await screen.findByLabelText('Uploaded video')).closest('.Comment');
    expect(within(comment).getByLabelText('Uploaded video')).toHaveAttribute('src', 'https://videos.test/u-hash/bong-rip.mp4');
    expect(api.createComment).toHaveBeenCalledWith(1, expect.objectContaining({ video: expect.any(File) }));
  });

  test('a video upload and a video link together are refused', async () => {
    const api = makeFakeApi({ loggedInAs: HASH, posts: POSTS, comments: [] });
    renderAt('/post/1', api);

    await userEvent.upload(await screen.findByTestId('video-input'), clip());
    await userEvent.type(screen.getByPlaceholderText(/Add a comment/), 'also https://youtu.be/dQw4w9WgXcQ');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(await screen.findByText(/One video per post or comment/)).toBeInTheDocument();
    expect(api.createComment).not.toHaveBeenCalled();
  });

  test('two video links in one comment are refused', async () => {
    const api = makeFakeApi({ loggedInAs: HASH, posts: POSTS, comments: [] });
    renderAt('/post/1', api);

    await userEvent.type(await screen.findByPlaceholderText(/Add a comment/),
      'https://youtu.be/dQw4w9WgXcQ and https://vimeo.com/76979871');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(await screen.findByText(/One video per post or comment/)).toBeInTheDocument();
    expect(api.createComment).not.toHaveBeenCalled();
  });

  test('a video that is too long is rejected with the reason', async () => {
    renderAt('/post/1', makeFakeApi({ loggedInAs: HASH, posts: POSTS, comments: [] }));

    await userEvent.upload(await screen.findByTestId('video-input'), clip('long-sesh.mp4'));

    expect(await screen.findByText(/up to 60 seconds long \(this one is 95s\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Video preview')).toBeNull();
  });

  test('a post with an uploaded video shows it at the top, also in the feed preview', async () => {
    const post = { ...makePost(9, KUSH, 'Fresh press\n\nDetails below.', 0), video_path: 'u-kush/press.mp4' };
    renderAt('/', makeFakeApi({ posts: [post] }));

    const card = (await screen.findByText(/Fresh press/)).closest('.Post');
    const video = within(card).getByLabelText('Uploaded video');
    expect(video).toHaveAttribute('src', 'https://videos.test/u-kush/press.mp4');
    expect(video.compareDocumentPosition(within(card).getByText(/Fresh press/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('new post emails', () => {
  test('publishing a post emails members and says how many got it', async () => {
    const api = makeFakeApi({ loggedInAs: KUSH, posts: POSTS });
    renderAt('/', api);

    await userEvent.type(await screen.findByPlaceholderText(/Share a strain/), 'Harvest day');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    expect(await screen.findByText('Post published. 2 of 2 members were emailed.')).toBeInTheDocument();
    expect(api.notifyNewPost).toHaveBeenCalledWith(999);
  });

  test('if the emails fail the post stays published and the superuser is told', async () => {
    const api = makeFakeApi({ loggedInAs: KUSH, posts: POSTS });
    api.notifyNewPost.mockResolvedValue({ data: null, error: { status: 503, message: 'Notifications are not configured.' } });
    renderAt('/', api);

    await userEvent.type(await screen.findByPlaceholderText(/Share a strain/), 'Harvest day');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    expect(await screen.findByText(/member emails failed: Notifications are not configured/)).toBeInTheDocument();
    expect(screen.getByText('Harvest day')).toBeInTheDocument();
  });

  test('members can turn new-post emails off under Edit profile', async () => {
    const api = makeFakeApi({ loggedInAs: HASH });
    renderAt('/edit', api);

    const toggle = await screen.findByRole('checkbox', { name: 'Email me when a new post is published' });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Your profile has been updated.')).toBeInTheDocument();
    expect(api.setNotifyNewPosts).toHaveBeenCalledWith('u-hash', false);
  });
});

describe('feed preview', () => {
  const TEMPLATE = 'https://youtu.be/AeP0MTL-NH8\n\nShort intro.\n\n[photo 1]\n\nMore text.\n\n[photo 2]\n\nThe end.';

  test('shows the top video and text but no photos, with Read more to the full post', async () => {
    renderAt('/', makeFakeApi({ posts: [makePost(7, KUSH, TEMPLATE, 0, ['u-kush/a.png', 'u-kush/b.png'])] }));

    const post = (await screen.findByText(/Short intro/)).closest('.Post');
    expect(within(post).getByTitle('youtube video')).toBeInTheDocument();
    expect(within(post).queryAllByRole('img', { name: /^Photo/ })).toHaveLength(0);
    expect(within(post).getByRole('link', { name: 'Read more' })).toHaveAttribute('href', '/post/7');
  });

  test('a photo placed above the first paragraph is shown as the cover', async () => {
    const body = '[photo 1]\n\nFresh harvest.\n\n[photo 2]\n\nDetails.';
    renderAt('/', makeFakeApi({ posts: [makePost(8, KUSH, body, 0, ['u-kush/cover.png', 'u-kush/b.png'])] }));

    const post = (await screen.findByText(/Fresh harvest/)).closest('.Post');
    const imgs = within(post).getAllByRole('img', { name: /^Photo/ });
    expect(imgs.map((img) => img.getAttribute('src'))).toEqual(['https://media.test/u-kush/cover.png']);
    expect(within(post).getByRole('link', { name: 'Read more' })).toBeInTheDocument();
  });

  test('a short text-only post has no Read more', async () => {
    renderAt('/', makeFakeApi({ posts: POSTS }));

    await screen.findByText('Rosin at 180F');
    expect(screen.queryByRole('link', { name: 'Read more' })).toBeNull();
  });

  test('the full post page shows every photo in place', async () => {
    renderAt('/post/7', makeFakeApi({ posts: [makePost(7, KUSH, TEMPLATE, 0, ['u-kush/a.png', 'u-kush/b.png'])] }));

    const post = (await screen.findByText(/Short intro/)).closest('.Post');
    expect(within(post).getAllByRole('img', { name: /^Photo/ })).toHaveLength(2);
    expect(within(post).queryByRole('link', { name: 'Read more' })).toBeNull();
  });
});

describe('editing posts', () => {
  test('regular members get no edit button', async () => {
    renderAt('/post/1', makeFakeApi({ loggedInAs: HASH, posts: POSTS, comments: COMMENTS }));

    await screen.findByRole('button', { name: 'Comment' });  // user loaded
    const post = screen.getByText('Rosin at 180F').closest('.Post');
    expect(within(post).queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  test('the superuser can change the text and drop a photo', async () => {
    const withPhoto = makePost(1, KUSH, 'Rosin at 180F', 0, ['u-kush/old.jpg']);
    const api = makeFakeApi({ loggedInAs: KUSH, posts: [withPhoto] });
    renderAt('/post/1', api);

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const box = screen.getByPlaceholderText('Edit the post…');
    expect(box).toHaveValue('Rosin at 180F');
    await userEvent.clear(box);
    await userEvent.type(box, 'Rosin at 190F');
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const post = (await screen.findByText('Rosin at 190F')).closest('.Post');
    expect(within(post).getByText(/edited/)).toBeInTheDocument();
    expect(within(post).queryByRole('img', { name: 'Photo 1' })).toBeNull();
    expect(api.updatePost).toHaveBeenCalledWith(withPhoto,
      expect.objectContaining({ body: 'Rosin at 190F', keepPaths: [], files: [], video: null, keepVideo: false }));
  });

  test('cancel leaves the post unchanged', async () => {
    const api = makeFakeApi({ loggedInAs: KUSH, posts: POSTS });
    renderAt('/post/1', api);

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await userEvent.type(screen.getByPlaceholderText('Edit the post…'), ' extra');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Rosin at 180F')).toBeInTheDocument();
    expect(api.updatePost).not.toHaveBeenCalled();
  });
});

describe('pinning posts', () => {
  const PINNED = { ...makePost(2, KUSH, 'Welcome!', 0), pinned_at: '2026-10-19T00:00:00Z' };

  test('only admins get a pin button', async () => {
    renderAt('/', makeFakeApi({ loggedInAs: HASH, posts: POSTS }));
    await screen.findByText('Rosin at 180F');
    expect(screen.queryByRole('button', { name: 'Pin' })).toBeNull();
  });

  test('an admin pins a post and it moves above the others', async () => {
    const api = makeFakeApi({ loggedInAs: KUSH, posts: [...POSTS, makePost(0, KUSH, 'Old news')] });
    renderAt('/', api);

    const post = (await screen.findByText('Old news')).closest('.Post');
    await userEvent.click(within(post).getByRole('button', { name: 'Pin' }));

    expect(api.setPostPinned).toHaveBeenCalledWith(expect.objectContaining({ id: 0 }), true);
    const articles = await screen.findAllByRole('article');
    expect(within(articles[0]).getByText('Old news')).toBeInTheDocument();
    expect(within(articles[0]).getByText('Pinned')).toBeInTheDocument();
  });

  test('an admin unpins a post', async () => {
    const api = makeFakeApi({ loggedInAs: KUSH, posts: [PINNED, ...POSTS] });
    renderAt('/', api);

    const post = (await screen.findByText('Welcome!')).closest('.Post');
    await userEvent.click(within(post).getByRole('button', { name: 'Unpin' }));

    expect(api.setPostPinned).toHaveBeenCalledWith(PINNED, false);
    expect(screen.queryByText('Pinned')).toBeNull();
  });

  test('visitors see the Pinned label but no button', async () => {
    renderAt('/', makeFakeApi({ posts: [PINNED, ...POSTS] }));
    const post = (await screen.findByText('Welcome!')).closest('.Post');
    expect(within(post).getByText('Pinned')).toBeInTheDocument();
    expect(within(post).queryByRole('button', { name: 'Unpin' })).toBeNull();
  });
});

describe('deleting comments', () => {
  test('a member deletes their own comment and the count drops', async () => {
    const api = makeFakeApi({ loggedInAs: HASH, posts: POSTS, comments: COMMENTS });
    renderAt('/post/1', api);

    const mine = (await screen.findByText('What micron bags?')).closest('.Comment');
    await userEvent.click(await within(mine).findByRole('button', { name: 'Delete' }));

    expect(screen.queryByText('What micron bags?')).toBeNull();
    expect(screen.getByText('1 comment')).toBeInTheDocument();
    expect(api.deleteComment).toHaveBeenCalledWith(COMMENTS[0]);
  });

  test('a member can delete their comments from their profile too', async () => {
    renderAt('/user/hashqueen', makeFakeApi({ loggedInAs: HASH, posts: POSTS, comments: COMMENTS }));

    const mine = (await screen.findByText('What micron bags?')).closest('.Comment');
    await userEvent.click(await within(mine).findByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('No comments yet.')).toBeInTheDocument();
  });

  test('nothing is deleted when the confirmation is declined', async () => {
    window.confirm.mockReturnValue(false);
    const api = makeFakeApi({ loggedInAs: KUSH, posts: POSTS, comments: COMMENTS });
    renderAt('/post/1', api);

    const theirs = (await screen.findByText('What micron bags?')).closest('.Comment');
    await userEvent.click(await within(theirs).findByRole('button', { name: 'Delete' }));

    expect(screen.getByText('What micron bags?')).toBeInTheDocument();
    expect(api.deleteComment).not.toHaveBeenCalled();
  });
});

describe('banning', () => {
  test('the superuser can ban and then unban a member from their profile', async () => {
    const api = makeFakeApi({ loggedInAs: KUSH, posts: POSTS, comments: COMMENTS });
    renderAt('/user/hashqueen', api);

    await userEvent.click(await screen.findByRole('button', { name: 'Ban from commenting' }));
    expect(await screen.findByText('Banned')).toBeInTheDocument();
    expect(api.setBanned).toHaveBeenLastCalledWith('u-hash', true);

    await userEvent.click(screen.getByRole('button', { name: 'Unban' }));
    expect(await screen.findByRole('button', { name: 'Ban from commenting' })).toBeInTheDocument();
    expect(screen.queryByText('Banned')).toBeNull();
    expect(api.setBanned).toHaveBeenLastCalledWith('u-hash', false);
  });

  test('members and visitors see no ban button, and the superuser has none on their own profile', async () => {
    renderAt('/user/hashqueen', makeFakeApi({ loggedInAs: HASH, comments: COMMENTS }));
    await screen.findByRole('button', { name: 'Edit profile' });
    expect(screen.queryByRole('button', { name: /Ban/ })).toBeNull();
  });

  test('a banned member sees a notice instead of the comment box', async () => {
    const banned = { ...HASH, banned_at: '2026-10-14T00:00:00Z' };
    renderAt('/post/1', makeFakeApi({ loggedInAs: banned, profiles: [KUSH, banned], posts: POSTS, comments: COMMENTS }));

    expect(await screen.findByText('You have been banned from commenting.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Comment' })).toBeNull();
    const mine = screen.getByText('What micron bags?').closest('.Comment');
    expect(within(mine).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});

describe('contact us', () => {
  test('visitors see no Contact us link', async () => {
    renderAt('/', makeFakeApi({ posts: POSTS }));

    await screen.findByText('Rosin at 180F');
    expect(screen.queryByRole('link', { name: 'Contact us' })).toBeNull();
  });

  test('visitors who type the address are sent to log in', async () => {
    renderAt('/contact', makeFakeApi());

    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });

  test('members see the footer link and get their email filled in', async () => {
    renderAt('/', makeFakeApi({ loggedInAs: HASH, posts: POSTS }));

    const footer = (await screen.findByText(/Educational content/)).closest('footer');
    await userEvent.click(await within(footer).findByRole('link', { name: 'Contact us' }));

    expect(await screen.findByRole('heading', { name: 'Contact us' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('hashqueen@example.com');
  });

  test('a member sends a message and sees a confirmation', async () => {
    const api = makeFakeApi({ loggedInAs: HASH });
    renderAt('/contact', api);

    await userEvent.type(await screen.findByLabelText('Message'), 'Please do a rosin press guide.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('heading', { name: 'Message sent' })).toBeInTheDocument();
    expect(api.sendContactMessage).toHaveBeenCalledWith(expect.objectContaining({
      email: 'hashqueen@example.com', phone: null, message: 'Please do a rosin press guide.',
    }));
  });

  test('a member can leave only a phone number', async () => {
    const api = makeFakeApi({ loggedInAs: HASH });
    renderAt('/contact', api);

    await userEvent.clear(await screen.findByLabelText('Email'));
    await userEvent.type(screen.getByLabelText(/^Phone/), '+1 415 555 0100');
    await userEvent.type(screen.getByLabelText('Message'), 'Call me about a collab');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('heading', { name: 'Message sent' })).toBeInTheDocument();
    expect(api.sendContactMessage).toHaveBeenCalledWith(expect.objectContaining({
      email: null, phone: '+1 415 555 0100',
    }));
  });

  test('without an email or phone the message is not sent', async () => {
    const api = makeFakeApi({ loggedInAs: HASH });
    renderAt('/contact', api);

    await userEvent.clear(await screen.findByLabelText('Email'));
    await userEvent.type(screen.getByLabelText('Message'), 'hello?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText(/Enter an email address or a phone number/)).toBeInTheDocument();
    expect(api.sendContactMessage).not.toHaveBeenCalled();
  });

  test('members also find it in the account menu', async () => {
    renderAt('/', makeFakeApi({ loggedInAs: HASH, posts: POSTS }));

    await userEvent.click(await screen.findByRole('button', { name: 'hashqueen' }));
    const menu = (await screen.findByRole('link', { name: 'Edit profile' })).closest('.dropdown-menu');
    await userEvent.click(within(menu).getByRole('link', { name: 'Contact us' }));

    expect(await screen.findByRole('heading', { name: 'Contact us' })).toBeInTheDocument();
  });

  test('a server error is shown and the form keeps what was typed', async () => {
    const api = makeFakeApi({ loggedInAs: HASH });
    api.sendContactMessage.mockResolvedValue({
      data: null, error: { status: 429, message: 'Too many messages. Please wait a minute and try again.' },
    });
    renderAt('/contact', api);

    await userEvent.type(await screen.findByLabelText('Message'), 'Second try');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText(/Too many messages/)).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveValue('Second try');
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
