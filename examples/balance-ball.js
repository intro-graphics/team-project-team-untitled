import { tiny, defs } from './common.js';

// Pull these names into this module's scope for convenience:
const { vec3, vec4, color, Mat4, Light, Shape, Material, Shader, Texture, Scene } = tiny;
const { Triangle, Square, Tetrahedron, Windmill, Cube, Subdivision_Sphere, Ring_Shader, Torus, Diamond_Ring } = defs;

export class Balance_Ball extends Scene {
  constructor() {
    // constructor(): Scenes begin by populating initial values like the Shapes and Materials they'll need.
    super();
    // At the beginning of our program, load one of each of these shape
    // definitions onto the GPU.  NOTE:  Only do this ONCE per shape it
    // would be redundant to tell it again.  You should just re-use the
    // one called "box" more than once in display() to draw multiple cubes.
    // Don't define more than one blueprint for the same thing here.
    this.shapes = {
      'background': new Cube(),
      'sky': new Subdivision_Sphere(4),
      'ball': new Subdivision_Sphere(4),
      'box': new Cube(),
      'torus': new Torus(30, 30, [[0, 2], [0, 1]]),
      'bonus1': new (Subdivision_Sphere)(4),
      'bonus2': new (Subdivision_Sphere)(2),
      'bonus_ring': new (Torus.prototype.make_flat_shaded_version())(15, 15, [[0, 2], [0, 1]]),
      'Diamond_ring': new Diamond_Ring(4, 4, [[0, 1], [0, 1]]),
    };

    /* START - define moving lights */

    this.light_positions = [];
    this.rows = 19
    this.columns = 10;
    this.row_lights = {};
    this.column_lights = {};

    for (let row = 0; row < this.rows; row++)
      for (let column = 0; column < this.columns; column++)
        this.light_positions.push(vec3(row, -2 - 2 * Math.random(), -column).randomized(1));
    for (let c = 0; c < this.columns; c++)
      this.row_lights[~~(-c)] = vec3(2 * Math.random() * this.rows, -Math.random(), -c);
    for (let r = 0; r < this.rows; r++)
      this.column_lights[~~(r)] = vec3(r, -Math.random(), -2 * Math.random() * this.columns);

    /* END - define moving lights */

    // *** Materials: *** Define a shader, and then define materials that use
    // that shader.  Materials rap a dictionary of "options" for the shader.
    // Here we use a Phong shader and the Material stores the scalar
    // coefficients that appear in the Phong lighting formulas so that the
    // appearance of particular materials can be tweaked via these numbers.

    const shader = new defs.Fake_Bump_Map(1);
    const phong = new defs.Phong_Shader();
    const ring = Ring_Shader;
    this.materials = {
      background: new Material(shader, {
        color: color(0, 0, 0, 1),
        ambient: 1,
        texture: new Texture("assets/background.jpg")
      }),
      sky: new Material(shader, {
        color: color(0, 0, 0, 1),
        ambient: 1,
        texture: new Texture("assets/sky.png")
      }),
      plastic: new Material(phong, {
        ambient: .2,
        diffusivity: 1,
        specularity: .5,
        color: color(.9, .5, .9, 1)
      }),
      ball: new Material(shader, {
        color: color(.4, .8, .4, 1),
        ambient: .4,
        texture: new Texture("assets/stars.png")
      }),
      bonus1: new Material(phong, {
        color: color(0.6, 0.3, 0, 1.0),
        ambient: 0.7,
        specular: 1,
        diffusivity: 1,
      }),
      bonus2: new Material(phong, {
        color: color(0.6, 0.3, 0, 1.0),
        ambient: 0.5,
        specular: 1,
        diffusivity: 1,
      }),

      bonus_ring: new Material(ring, {
        color: color(0.6, 0.3, 0, 1.0),
        ambient: 0.5,
        specular: 1,
        diffusivity: 1,
      }),
    };

    this.initial_camera_location = Mat4.look_at(vec3(0, 10, 20), vec3(0, 0, 0), vec3(0, 1, 0));

    this.ball = Mat4.identity();
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.anglex = 0;
    this.anglez = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;

    this.left = this.right = this.forward = this.back = this.safe = this.bonus1_hit = this.bonus2_hit = false;
  }
  make_control_panel() {
    // make_control_panel(): Sets up a panel of interactive HTML elements, including
    // buttons with key bindings for affecting this scene, and live info readouts.
    this.key_triggered_button("Fixed View", ["b"], () => this.attached = () => Mat4.look_at(vec3(this.ball[0][3], this.ball[1][3] + 2, this.ball[2][3] + 10), vec3(this.ball[0][3], this.ball[1][3], this.ball[2][3]), vec3(0, 1, 1)));
    this.key_triggered_button("Panorama View", ["p"], () => this.attached = () => Mat4.look_at(vec3(30, 90, -30), vec3(30, 0, -30), vec3(0, 0, -1)));
    this.new_line();
    this.key_triggered_button("Left", ["j"], () => this.left = true);
    this.key_triggered_button("Right", ["l"], () => this.right = true);
    this.new_line();
    this.key_triggered_button("Forward", ["i"], () => this.forward = true);
    this.key_triggered_button("Back", ["k"], () => this.back = true);
  }
  display(context, program_state) {
    // display():  Called once per frame of animation.

    // Setup -- This part sets up the scene's overall camera matrix, projection matrix, and lights:
    if (!context.scratchpad.controls) {
      this.children.push(context.scratchpad.controls = new defs.Movement_Controls());

      // Define the global camera and projection matrices, which are stored in program_state.  The camera
      // matrix follows the usual format for transforms, but with opposite values (cameras exist as
      // inverted matrices).  The projection matrix follows an unusual format and determines how depth is
      // treated when projecting 3D points onto a plane.  The Mat4 functions perspective() and
      // orthographic() automatically generate valid matrices for one.  The input arguments of
      // perspective() are field of view, aspect ratio, and distances to the near plane and far plane.
      program_state.set_camera(this.initial_camera_location);
    }
    program_state.projection_transform = Mat4.perspective(Math.PI / 4, context.width / context.height, 1, 1000);

    // *** Lights: *** Values of vector or point lights.  They'll be consulted by
    // the shader when coloring shapes.  See Light's class definition for inputs.


    /* START - draw moving lights */
    this.light_positions.forEach((p, i, a) => {
      program_state.lights = [new Light(this.row_lights[~~p[2]].to4(1), color(p[2] % 1, 1, 1, 1), 9),
      new Light(this.column_lights[~~p[0]].to4(1), color(1, 1, p[0] % 1, 1), 9),
    ];
    }
    );
    for (const [key, val] of Object.entries(this.row_lights)) {
      this.row_lights[key][0] += program_state.animation_delta_time / 1000;
      this.row_lights[key][0] %= this.rows * 2;
    }
    for (const [key, val] of Object.entries(this.column_lights)) {
    this.column_lights[key][2] -= program_state.animation_delta_time / 1000;
      this.column_lights[key][2] %= this.columns * 2;
    }

    /* END - draw moving lights */

    // program_state.lights = [
    //     new Light(vec4(5, -10, 5, 1), color(1, 1, 1, 1), 10000),
    //     new Light( this.row_lights   [ ~~p[2] ].to4(1), color( p[2]%1,1,1,1 ), 9 )
    // ];

    for (const [key, val] of Object.entries(this.row_lights)) {
      this.row_lights[key][0] += program_state.animation_delta_time / 50;
      this.row_lights[key][0] %= this.rows * 2;
    }

    // program_state.lights = [new Light(vec4(0, 0, 0, 1), color(1, 1, 1, 1), 1000000)];
    /**********************************
     Start coding down here!!!!
     **********************************/
    const t = program_state.animation_time / 1000;
    const dt = program_state.animation_delta_time / 1000;
    const g = 9.8;
    const blue = color(0, 0, 1, 1)
      , yellow = color(1, 1, 0, 1);

    /* START - drawing background */
    //let background_m = Mat4.identity().times(Mat4.translation(0,-5,0)).times(Mat4.rotation(-Math.PI/2,1,0,0)).times(Mat4.scale(100, 100, 100));
    //this.shapes.background.draw(context, program_state, background_m, this.materials.background);

    let background_m = Mat4.identity().times(Mat4.scale(100, 100, 100));
    this.shapes.sky.draw(context, program_state, background_m, this.materials.sky);
    /* END - drawing background */

    /* START - update ball's position */

    this.ball = Mat4.identity().times(Mat4.translation(this.x, this.y, this.z)).times(Mat4.rotation(this.anglex, 1, 0, 0)).times(Mat4.rotation(this.anglez, 0, 1, 0));
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    this.anglex += this.vz * dt / (Math.PI);
    this.anglez += this.vx * dt / (Math.PI);

    /* END - update ball's position */

    /* START - Draw some road */
    let box_m = Mat4.identity().times(Mat4.translation(0, -1.2, -2)).times(Mat4.scale(1.2, 0.2, 1));
    for (var i = 0; i < 8; i++) {
      this.shapes.box.draw(context, program_state, box_m, this.materials.ball);
      box_m = box_m.times(Mat4.translation(0, 0, 2));
    }
    for (var i = 0; i < 4; i++) {
      this.shapes.box.draw(context, program_state, box_m, this.materials.ball);
      box_m = box_m.times(Mat4.translation(2, 0, 0));
    }
    for (var i = 0; i < 15; i++) {
      this.shapes.box.draw(context, program_state, box_m, this.materials.ball);
      box_m = box_m.times(Mat4.translation(0, 0, -2));
    }

    // Branched route
    let box_m_1 = box_m;
    // 1    /// TO FIX: ROLLING BECOMES STRANGE HERE
    for (var i = 0; i < 15; i++) {
      this.shapes.box.draw(context, program_state, box_m_1, this.materials.ball);
      box_m_1 = box_m_1.times(Mat4.translation(2, 0, 0));
    }

    let box_m_2 = box_m;
    // 2
    for (var i = 0; i < 15; i++) {
      this.shapes.box.draw(context, program_state, box_m_2, this.materials.ball);
      box_m_2 = box_m_2.times(Mat4.translation(0, 0, -2));
    }
    // 3
    for (var i = 0; i < 15; i++) {
      this.shapes.box.draw(context, program_state, box_m_1, this.materials.ball);
      box_m_1 = box_m_1.times(Mat4.translation(0, 0, -2));
    }
    // 4
    for (var i = 0; i < 14; i++) {
      this.shapes.box.draw(context, program_state, box_m_2, this.materials.ball);
      box_m_2 = box_m_2.times(Mat4.translation(2, 0, 0));
    }
    box_m = box_m_2;

    // goal
    let ring_m = Mat4.identity().times(Mat4.translation(0,1,-1)).times(box_m_1).times(Mat4.rotation(t * Math.PI / 2, 1, 0, 0)).times(Mat4.scale(.2, .2, .2));
    let ring_m_2 = Mat4.identity().times(Mat4.translation(0,1,-1)).times(box_m_1).times(Mat4.rotation(t * Math.PI / 2, 0, 1, 1)).times(Mat4.rotation(Math.PI / 4, 0, 1, 0)).times(Mat4.scale(.2, .2, .2));
    this.shapes.Diamond_ring.draw(context, program_state, ring_m, this.materials.plastic.override({
      color: color(.5, .7, .95, 1)
    }));
    this.shapes.Diamond_ring.draw(context, program_state, ring_m_2, this.materials.plastic.override({
      color: color(.5, .7, .95, 1)
    }));

    /* END - Draw some road */
    
    /* START - draw bonus shapes */
    this.sun_r = 2 + Math.sin(0.8 * Math.PI * t);
    let red = 0.5 + 0.5 * Math.sin(0.4 * Math.PI * t);
    let green = 0.5 + 0.5 * Math.sin(0.4 * Math.PI * t - Math.PI);
    this.sun_color = color(red, green, 0, 1);

    let bonus1_m = Mat4.translation(0, 0, 14);

    let angle = 0.5 * Math.sin(0.4 * Math.PI * t);
    let wobble = Mat4.rotation(angle, 1, 1, 0);
    let sin_m = Mat4.translation(0, 2.5 + 2.5 * Math.sin(0.4 * Math.PI * t), 0);
    let bonus2_m = Mat4.translation(5, 0, 14.).times(sin_m);

    /* Detect collision */
    if (((14 - this.z) ** 2 + (0 - this.x) ** 2) ** (1 / 2) <= 2)
      this.bonus1_hit = true;
    if (((bonus2_m[2][3] - this.z) ** 2 + (bonus2_m[1][3] - this.y) ** 2 + (bonus2_m[0][3] - this.x) ** 2) ** (1 / 2) <= 2)
      this.bonus2_hit = true;

    if (this.bonus1_hit)
      /// don't know what to do lol
      ;
    else
      this.shapes.bonus1.draw(context, program_state, bonus1_m, this.materials.bonus1.override({
        color: this.sun_color
      }));

    if (this.bonus2_hit)
      /// fix this
      ;
    else
      this.shapes.bonus2.draw(context, program_state, bonus2_m, this.materials.bonus2);
    //this.shapes.bonus_ring.draw(context, program_state, bonus2_m.times(wobble).times(Mat4.scale(1, 1, 0.01)), this.materials.bonus_ring);

    /* END - draw bonus shapes */


    /* START - Falling */
    if (this.ball[2][3] >= -3.8 && this.ball[2][3] <= 13 && this.ball[0][3] >= -2 && this.ball[0][3] <= 2) {
      this.safe = true;
    }
    if (this.ball[2][3] >= 12 && this.ball[2][3] <= 16 && this.ball[0][3] >= -2 && this.ball[0][3] <= 12) {
      this.safe = true;
    }
    // 2
    if (this.ball[2][3] >= -47 && this.ball[2][3] <= 13 && this.ball[0][3] >= 6 && this.ball[0][3] <= 12) {
      this.safe = true;
    }
    // 4
    if (this.ball[2][3] >= -47 && this.ball[2][3] <= -44 && this.ball[0][3] >= 6 && this.ball[0][3] <= 42.5) {
      this.safe = true;
    }
    // 3 
    if (this.ball[2][3] >= -45 && this.ball[2][3] <= -14 && this.ball[0][3] >= 36 && this.ball[0][3] <= 46) {
      this.safe = true;
    }
    // 1
    if (this.ball[2][3] >= -18 && this.ball[2][3] <= -14 && this.ball[0][3] >= 6 && this.ball[0][3] <= 46) {
      this.safe = true;
    }
    if (!this.safe) {
      this.vy -= 10 * g * dt;
      if (this.vy < -50) {
        this.vy = -50;
      }
    }
    /* END - Falling */

    /* START - Calculate the velocity */
    if (this.left) {
      this.vx = this.vx - 100 * dt;
    } else {
      if (this.vx < 0) {
        this.vx = this.vx + 10 * dt;
        if (this.vx > 0) {
          this.vx = 0;
        }
      }
    }

    if (this.right) {
      this.vx = this.vx + 100 * dt;
    } else {
      if (this.vx > 0) {
        this.vx = this.vx - 10 * dt;
        if (this.vx < 0) {
          this.vx = 0;
        }
      }
    }

    if (this.forward) {
      this.vz = this.vz - 100 * dt;
    } else {
      if (this.vz < 0) {
        this.vz = this.vz + 10 * dt;
        if (this.vz > 0) {
          this.vx = 0;
        }
      }
    }

    if (this.back) {
      this.vz = this.vz + 100 * dt;
    } else {
      if (this.vz > 0) {
        this.vz = this.vz - 10 * dt;
        if (this.vz < 0) {
          this.vz = 0;
        }
      }
    }
    /* END - Calculate the velocity */

    this.shapes.ball.draw(context, program_state, this.ball, this.materials.ball.override(blue));
    // render the ball
    if (typeof this.attached !== 'undefined') {
      program_state.set_camera(this.attached().times(Mat4.translation(0, -2, -10)));
    }
    this.left = this.right = this.forward = this.back = this.safe = false;
    // reset
  }
}
