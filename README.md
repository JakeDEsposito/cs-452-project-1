# Implementation

This recreation of Atari's Asteroids has been a joy to create. Throughout development, I gained a deeper understanding of not just graphics, but also game development. From coding the game mechanics to creating the visuals, I will take you through the development of this project.

## Development Environment

This project was coded entirely in [VSCode](https://code.visualstudio.com) and debugged and developed using [Chrome](https://www.google.com/chrome).

Libraries were an important part of this project. Without them, development would have been too slow. Here are a list of the libraries I used and some of the ways that I used them:

* [three.js](https://threejs.org)
    * Graphics
    * Scene Management
    * Vector Mathematics
* [howler.js](https://howlerjs.com)
    * Audio playback and Manipulation
* [Rapier](https://rapier.rs)
    * 2D Physics
* [Detect GPU](https://github.com/pmndrs/detect-gpu#readme)
    * Performance Detection

## Game Mechanics

### Gameplay

The player is spawned as a green ship. The controls are basic: w to propel forward, a and d to rotate left and right, and space to shoot. Also, the player can pause the game by pressing escape. All game objects are dynamic physics bodies that can have forces act upon it. This means that movement isn't instantaneous. Instead, it takes time to accelerate. The number of asteroids increases as time passes and points are awarded.

### Rules

The score is counted by how many asteroids the player has shot. An asteroid can be destroyed by colliding with or shooting it. The player has three lives. A life is lost when the player collides with an asteroid. However, after a player collides with an asteroid, there is a brief window of invulnerability when the player cannot take any damage. The game ends when a player has no more lives left.

## Code Structure

Admittedly, this project is not very well orginized. All of the game's code is written in a single file. This leads to somewhat messy code. Instead of explaining all aspects of the code, I will pick out a few aspects that I find to be the most interesting and talk about those.

### Physical

Physical is the parent class to the Ship, Asteroid, and Bullet classes. Physical's job is to hold information about its rigid body, collider, health, and more. Physical is also partially in change of disposing of itself whenever it has been killed. The logic for loosing health is almost always partially overwritten in children classes of Physical.

### Ship

Ship is the class meant to represent the player ship. It is in charge of moving itself and updating its own position based on the position of its rigid body. Also, it is in charge of spawning bullets when the shoot action is pressed. Ship will also play audio using [howler.js](https://howlerjs.com) for specific events like moving, shooting, taking hits, and dying.

### Asteroid

Asteroid is the class meant to represent the asteroids in the game. An asteroid is created by first taking a circle represented by 12 points eventy distributed along its circumference. Every third point is moved inwards and over by some factor to create craters in the asteroids. An asteroids size determines if it should spawn more asteroids. Size 1 means it will not spawn asteroids, size 2 will spawn size 1 asteroids. These asteroids are spawned in a similar matter to how the asteroid is created, with points being new asteroids and the number of points being some integer between 1 and 3. An asteroids rigid body is represented by a "ball" or circle. Just like Ship, Asteroid will play audio for events like dying.

### Bullet

Bullet is the class meant to represent the bullets in the game. This is the simplest Physical. The only unique mechanic that it has is that it will dispose of itself after a set time.

### animate

"animate" is the function that is incharge of the gameplay loop. It hosts a few responsibilities, such as pausing the game, updating the UI, restarting the game, updating the game objects and physics, spawning the asteroids, handling the collision, and more. I will now go into detail about some of these responsibilities.

#### Asteroid Spawning System

This systems job is to spawn new asteroids in around the player, an asteroid is spawned in at a random angle at a position that is somewhere off screen for the player. This newly spawned asteroid is then given a randomized push towards the player.

#### Collision Handling

The collision for this game is handled in an interesting way. Technically, the only way that an object collides with another object is if it is colliding with an asteroid. I.E. only asteroids are checked for collision. First a list of all asteroids is pulled from the scene, then this list is iterated through to get each asteroid. An asteroid is checked to see if it has been disposed already or is out of the max distance for a asteroid to be from the player. If it is, we move on to another asteroid. Then, the asteroid is updated and checked to see if it is reporting any collisions with other objects. If the other object is a bullet, the score is incremented. If the other object isn't another asteroid, then the other object and asteroid take a hit.

## Challenges Faced

Throughout development, there has been a few challenges. One challenging part of this project was the asteroids. Crashes would occur if multiple asteroids were to spawn ontop of one another. These crashes were caused by the asteroid being disposed from the physics world but still having functions called on it. This would greatly change how the final game looked. Asteroids where initially intended to get as large as size 3 and spawn up to 4 new asteroids when destroyed. This would never see the light of day due to these bugs.

Bullet would have a similar issue. Since a bullet could dispose of itself after a set time, it could lead to the following chain of events:

1. A bullet collides with an asteroid.
1. The bullet is dispose.
1. The bullets dispose timer runs out and the bullet is attempted to be disposed again.
1. A crash would occur due to calling a function of an object that does not exist.

There were other issues with collision. Some I actually enjoyed and kept in the game. For example, if you see an asteroid speed past you, this is most likely because it was spawned inside another asteroid and as a result it gets pushed out at a high velocity. Some issues would crash the game. For instance, take three objects, all of which are colliding. The first two objects get disposed of just fine. However, when it comes around to handling the third object, the program falls apart as functions are called on an already disposed object.

This was an annoying yet fun issue to solve as I was able to use the Chrome Debugger for the first time.

# Controls

| Action | Input |
| --- | --- |
| Rotate Left | a |
| Rotate Right | d |
| Propel Forward | w |
| Shoot | Space |
| Pause | Escape |

# Credits

## Music & Audio

[Determination](https://www.youtube.com/watch?v=h1wSPmlZV-w) - Toby Fox | UNDERTALE Soundtrack

Sci-Fi Sounds (1.0) - [Kenney](https://www.kenney.nl)

## Textures

[Seamless Space / Stars](https://opengameart.org/content/seamless-space-stars) - n4

## Fonts

[Hyperspace Font](https://www.fontspace.com/hyperspace-font-f18038) - Pixel Sagas

## Shaders

Bad TV Shader - [Felix Turner](https://www.airtight.cc)

Static Effect Shader - [Felix Turner](https://www.airtight.cc)

Film Grain & Scanlines Shader - [alteredq](http://alteredqualia.com)

## Libraries

[three.js](https://threejs.org)

[howler.js](https://howlerjs.com)

[Rapier](https://rapier.rs)

[Detect GPU](https://github.com/pmndrs/detect-gpu#readme)

# GitHub Pages

[Link to Live Page](https://jakedesposito.github.io/cs-452-project-1)
