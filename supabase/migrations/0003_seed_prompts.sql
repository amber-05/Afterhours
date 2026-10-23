-- Afterhours — friend-group question bank + a new "friendly" vibe.
-- Safe to run once after 0001/0002.

-- 1) Add the 'friendly' vibe (the wholesome, appreciate-your-people one) and make it the default.
alter table public.rooms   drop constraint if exists rooms_vibe_check;
alter table public.prompts drop constraint if exists prompts_vibe_check;
alter table public.rooms   add constraint rooms_vibe_check
  check (vibe in ('friendly', 'fun', 'romantic', 'spicy', 'mixed'));
alter table public.prompts add constraint prompts_vibe_check
  check (vibe in ('friendly', 'fun', 'romantic', 'spicy'));
alter table public.rooms alter column vibe set default 'friendly';

create or replace function public.update_settings(p_code text, p_vibe text default null, p_reveal_author boolean default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := public._uid();
  v_room public.rooms;
begin
  select * into v_room from public.rooms where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id <> v_uid then raise exception 'not_host'; end if;
  if p_vibe is not null and p_vibe not in ('friendly', 'fun', 'romantic', 'spicy', 'mixed') then
    raise exception 'invalid_vibe';
  end if;

  update public.rooms
     set vibe = coalesce(p_vibe, vibe),
         reveal_author = coalesce(p_reveal_author, reveal_author),
         updated_at = now()
   where id = v_room.id;
end $$;

-- 2) Question bank — written for real friend groups (Indian + global: group chats, family
--    pressure, ghosting, split bills, late-night food, situationships). Add your own rows any time.
delete from public.prompts;

insert into public.prompts (game, vibe, text) values
-- ===== Who's Most Likely? — friendly
('most_likely','friendly','Who would you call first at 3am if something went wrong?'),
('most_likely','friendly','Who always shows up with food when someone is having a bad day?'),
('most_likely','friendly','Who gives the best advice but never follows it themselves?'),
('most_likely','friendly','Who is the unofficial therapist of this group?'),
('most_likely','friendly','Who would drop everything and travel 3 hours for you?'),
('most_likely','friendly','Who remembers everyone''s birthdays and plans the surprise?'),
('most_likely','friendly','Who is the glue that holds this friend group together?'),
('most_likely','friendly','Who would defend you in the group chat when you''re not there?'),
('most_likely','friendly','Who would lend you money without asking why?'),
('most_likely','friendly','Who is most likely to still be your best friend at 60?'),
-- ===== Who's Most Likely? — fun
('most_likely','fun','Who says "5 minutes, almost there" while still in bed?'),
('most_likely','fun','Who has 14,000 unread messages and 3 muted groups?'),
('most_likely','fun','Who is most likely to "pay you back tomorrow" and forget for a month?'),
('most_likely','fun','Who orders food at 2am and regrets nothing?'),
('most_likely','fun','Who takes 40 photos and posts the one that looks like the first?'),
('most_likely','fun','Who is most likely to plan a trip in the group chat and then cancel?'),
('most_likely','fun','Who would argue with the delivery guy about the address?'),
('most_likely','fun','Who is the most dramatic over a small inconvenience?'),
('most_likely','fun','Who would cry watching a pet video at 1am?'),
('most_likely','fun','Who falls asleep first at every sleepover or road trip?'),
('most_likely','fun','Who has the most chaotic playlist taste?'),
('most_likely','fun','Who is most likely to become a meme by accident?'),
-- ===== Who's Most Likely? — romantic
('most_likely','romantic','Who is most likely to get married first?'),
('most_likely','romantic','Who is still low-key hung up on an ex?'),
('most_likely','romantic','Who is the biggest hopeless romantic here?'),
('most_likely','romantic','Who is most likely to get stuck in a situationship for a year?'),
('most_likely','romantic','Who would stalk a crush''s Instagram and accidentally like an old post?'),
('most_likely','romantic','Who would be the first to say "I love you"?'),
('most_likely','romantic','Who has the best (or worst) taste in partners?'),
('most_likely','romantic','Who would say "just friends" and obviously mean more?'),
('most_likely','romantic','Who is most likely to fall in love on a trip and move cities?'),
('most_likely','romantic','Who will cry the hardest at a friend''s wedding?'),
-- ===== Who's Most Likely? — spicy
('most_likely','spicy','Who is most likely to send a risky text and instantly regret it?'),
('most_likely','spicy','Who is most likely to ghost someone after a great first date?'),
('most_likely','spicy','Who is most likely to have a secret none of us know?'),
('most_likely','spicy','Who is most likely to date a friend''s ex?'),
('most_likely','spicy','Who is the best kisser?'),
('most_likely','spicy','Who is most likely to sneak out and not tell anyone?'),
('most_likely','spicy','Who would lie to their parents about where they were last weekend?'),
('most_likely','spicy','Who is the worst at hiding a crush?'),
('most_likely','spicy','Who is most likely to slide into someone''s DMs after two drinks?'),
('most_likely','spicy','Who has the most unhinged dating app profile?'),

-- ===== Anonymous Confessions — friendly
('confessions','friendly','Confess something you''ve always wanted to thank someone in this room for.'),
('confessions','friendly','Confess a time a friend carried you through a hard phase without you asking.'),
('confessions','friendly','Confess something you admire about someone here but never said out loud.'),
('confessions','friendly','Confess what you were most scared of before you met this group.'),
('confessions','friendly','Confess a small thing a friend did that meant the world to you.'),
('confessions','friendly','Confess a time you felt left out in this group and never said it.'),
-- ===== Anonymous Confessions — fun
('confessions','fun','Confess something you pretend to like just to fit in.'),
('confessions','fun','Confess a lie you told your parents or boss that got out of hand.'),
('confessions','fun','Confess something you "borrowed" and never returned.'),
('confessions','fun','Confess the pettiest reason you muted someone.'),
('confessions','fun','Confess something you do alone that you''d never do in front of friends.'),
('confessions','fun','Confess how much you actually spend on food delivery in a month.'),
-- ===== Anonymous Confessions — romantic
('confessions','romantic','Confess a crush you''ve never admitted to.'),
('confessions','romantic','Confess something you wish you had said to an ex.'),
('confessions','romantic','Confess what you secretly want in a partner.'),
('confessions','romantic','Confess a time a friend was right about your relationship and you ignored them.'),
('confessions','romantic','Confess whether you''ve ever stayed in a relationship because of what people would say.'),
('confessions','romantic','Confess the moment you realised you were in love (or wanted to be).'),
-- ===== Anonymous Confessions — spicy
('confessions','spicy','Confess something you''ve done that you hope never gets out.'),
('confessions','spicy','Confess a secret you''re keeping from someone in this room.'),
('confessions','spicy','Confess something you''ve hidden from your family that they''d freak out about.'),
('confessions','spicy','Confess the worst thing you did in a relationship.'),
('confessions','spicy','Confess something you did at a party that your friends don''t know about.'),
('confessions','spicy','Confess who you''ve had a crush on that would shock this group.'),

-- ===== Truth or Spill — friendly
('truth_or_spill','friendly','What is your favourite memory with this friend group?'),
('truth_or_spill','friendly','What is something a friend did for you that you''ll never forget?'),
('truth_or_spill','friendly','What is your best quality as a friend, honestly?'),
('truth_or_spill','friendly','What is one thing you''d love to do together as a group this year?'),
('truth_or_spill','friendly','Who in this room has changed your life for the better, and how?'),
('truth_or_spill','friendly','What is something you wish your friends knew about what you''re going through?'),
-- ===== Truth or Spill — fun
('truth_or_spill','fun','What is the most embarrassing song on your playlist?'),
('truth_or_spill','fun','What is your most irrational fear?'),
('truth_or_spill','fun','What is the worst haircut or outfit decision you''ve ever made?'),
('truth_or_spill','fun','What app do you waste the most time on, and how many hours a day?'),
('truth_or_spill','fun','What is the funniest thing your parents have said about your life choices?'),
('truth_or_spill','fun','What is the most you''ve ever spent on something you didn''t need?'),
-- ===== Truth or Spill — romantic
('truth_or_spill','romantic','What is your biggest green flag in a partner?'),
('truth_or_spill','romantic','What is the cringiest thing you''ve done for a crush?'),
('truth_or_spill','romantic','What is your love language, honestly?'),
('truth_or_spill','romantic','Who was your biggest "what if"?'),
('truth_or_spill','romantic','How do you feel when people keep asking when you''re getting married?'),
('truth_or_spill','romantic','What is a dealbreaker you''d never admit on a first date?'),
-- ===== Truth or Spill — spicy
('truth_or_spill','spicy','What is the most daring thing you''ve done in public?'),
('truth_or_spill','spicy','Have you ever been caught doing something you shouldn''t? What happened?'),
('truth_or_spill','spicy','Who in this room would you most want to kiss?'),
('truth_or_spill','spicy','What is the most unhinged thing you''ve done after a few drinks?'),
('truth_or_spill','spicy','What is something you''ve done that you''d never tell your parents?'),
('truth_or_spill','spicy','What is your biggest turn-on?'),

-- ===== Guess Who? — friendly
('guess_who','friendly','Write something people would be surprised to learn about you.'),
('guess_who','friendly','Write something you''re quietly proud of.'),
('guess_who','friendly','Write a childhood memory you still think about.'),
('guess_who','friendly','Write the best compliment you''ve ever received.'),
('guess_who','friendly','Write what you do to cheer yourself up on a bad day.'),
('guess_who','friendly','Write a dream you have that you rarely share.'),
-- ===== Guess Who? — fun
('guess_who','fun','Write a weird habit you have.'),
('guess_who','fun','Write the strangest food combination you secretly love.'),
('guess_who','fun','Write a useless talent you have.'),
('guess_who','fun','Write a "never have I ever" that only you could say.'),
('guess_who','fun','Write the most embarrassing thing in your camera roll, described, not shown.'),
('guess_who','fun','Write something you did as a kid that makes you cringe now.'),
-- ===== Guess Who? — romantic
('guess_who','romantic','Write the most romantic thing someone has done for you.'),
('guess_who','romantic','Write your biggest relationship red flag.'),
('guess_who','romantic','Write something you''ve done to impress a crush.'),
('guess_who','romantic','Write your ideal first date in one sentence.'),
('guess_who','romantic','Write the worst date you''ve ever been on.'),
('guess_who','romantic','Write the weirdest thing that turns you off.'),
-- ===== Guess Who? — spicy
('guess_who','spicy','Write your wildest "never have I ever" confession.'),
('guess_who','spicy','Write a secret you''d be mortified for your parents to read.'),
('guess_who','spicy','Write your most chaotic late-night decision.'),
('guess_who','spicy','Write the boldest pick-up line you''ve actually used.'),
('guess_who','spicy','Write the juiciest thing you know about someone and pretend you don''t.'),
('guess_who','spicy','Write something you''ve done for a crush that you''d deny forever.');
