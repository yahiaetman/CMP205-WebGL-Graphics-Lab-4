import { Scene } from '../common/game';
import ShaderProgram from '../common/shader-program';
import Mesh from '../common/mesh';
import * as MeshUtils from '../common/mesh-utils';
import * as TextureUtils from '../common/texture-utils';
import Camera from '../common/camera';
import FlyCameraController from '../common/camera-controllers/fly-camera-controller';
import { vec3, mat4, quat } from 'gl-matrix';
import { Vector, Selector, Color, NumberInput, CheckBox } from '../common/dom-utils';
import { createElement, StatelessProps, StatelessComponent } from 'tsx-create-element';

// It is better to create interfaces for each type of light for organization (think of them as structs)
// We use the same organization as the TexturedMaterialScene but we more properties for the shadow mapping
interface AmbientLight {
    type: 'ambient',
    enabled: boolean,
    skyColor: vec3,
    groundColor: vec3,
    skyDirection: vec3,
    hasShadow: false // Ambient lights can't have shadow (they actually have shadow but they are hard to implement in realtime)
};

// Here, we will implement Cascaded Shadow Maps for Directional Lights
interface DirectionalLight {
    type: 'directional',
    enabled: boolean,
    color: vec3,
    direction: vec3
    hasShadow: boolean,
    shadowMaps: WebGLTexture[], // This will store the shadow map for each cascade
    shadowVPs: mat4[], // This will store the View Projection matrix for each cascade
    cascades: number[], // This will store the cascade distance (how much far from the camera does a shadow map cover)
    shadowMapResolution: number, // The resolution of each shadow map
    shadowBias: number, // The shadow bias (will be explained later in the code)
    shadowSlopeBias: number, // The shadow slope (will be explained later in the code)
    shadowDistance: number // How far along the shadow direction can the shadow map cover
};

// Here, we will implement Cube Shadow Maps for Point Lights
interface PointLight {
    type: 'point',
    enabled: boolean,
    color: vec3,
    position: vec3,
    attenuation_quadratic: number,
    attenuation_linear: number,
    attenuation_constant: number,
    hasShadow: boolean,
    shadowMaps: WebGLTexture[], // This will store the shadow map for each direction (6 faces in total)
    shadowVPs: mat4[], // This will store the View Projection matrix for each direction
    shadowMapResolution: number, // The resolution of each shadow map
    shadowBias: number, // The shadow bias (will be explained later in the code)
    shadowSlopeBias: number, // The shadow slope (will be explained later in the code)
    shadowNear: number, // The nearest depth the shadow can see
    shadowFar: number // The farthest depth the shadow can see
};

// Here, we will implement Shadow Maps for Spot Lights
interface SpotLight {
    type: 'spot',
    enabled: boolean,
    color: vec3,
    position: vec3,
    direction: vec3,
    attenuation_quadratic: number,
    attenuation_linear: number,
    attenuation_constant: number,
    inner_cone: number,
    outer_cone: number,
    hasShadow: boolean,
    shadowMaps: WebGLTexture[], // This will store the shadow map (we only need 1 but we still use an array to be consistent with other light types)
    shadowVPs: mat4[], // This will store the View Projection matrix (we also need only one)
    shadowMapResolution: number, // The resolution of the shadow map
    shadowBias: number, // The shadow bias (will be explained later in the code)
    shadowSlopeBias: number, // The shadow slope (will be explained later in the code)
    shadowNear: number, // The nearest depth the shadow can see
    shadowFar: number // The farthest depth the shadow can see
};

// This union type: it can be any of the specified types
type Light = AmbientLight | DirectionalLight | PointLight | SpotLight;

// The material properties are the same as TexturedModelsScene
interface Material {
    albedo: WebGLTexture,
    albedo_tint: vec3,
    specular: WebGLTexture,
    specular_tint: vec3
    roughness: WebGLTexture,
    roughness_scale: number,
    ambient_occlusion: WebGLTexture,
    emissive: WebGLTexture,
    emissive_tint: vec3
};

// This will represent an object in 3D space
interface Object3D {
    mesh: Mesh,
    material: Material,
    modelMatrix: mat4
};

// Given a vector, this will return an arbitrary perpendicular vector
function perpendicular(directon: vec3): vec3 {
    return vec3.cross(vec3.create(), directon, directon[1] == 0 && directon[2] == 0 ? [0, 0, 1] : [1, 0, 0]);
}

// In this scene we will draw a scene with shadow mapping
export default class ShadowMappingScene extends Scene {
    programs: {[name: string]: ShaderProgram} = {};
    camera: Camera;
    controller: FlyCameraController;
    meshes: {[name: string]: Mesh} = {};
    textures: {[name: string]: WebGLTexture} = {};
    samplers: {[name: string]: WebGLSampler} = {};
    frameBuffer: WebGLFramebuffer; // We need a frame buffer to draw shadow maps

    // We will store the lights here
    lights: Light[] = [
        { type: "ambient", enabled: true, skyColor: vec3.fromValues(0.2, 0.3, 0.4), groundColor: vec3.fromValues(0.1, 0.1, 0.1), skyDirection: vec3.fromValues(0,1,0), hasShadow: false},
        { type: 'directional', enabled: true, color: vec3.fromValues(0.5,0.5,0.5), direction:vec3.fromValues(-1,-1,-1), hasShadow: true, shadowMaps:[], shadowVPs: [], cascades: [2, 10, 100], shadowMapResolution: 1024, shadowBias: 1, shadowSlopeBias: 1.5, shadowDistance: 800 },
        { type: 'point', enabled: true, color: vec3.fromValues(10,8,2), position:vec3.fromValues(0,2.5,0), attenuation_quadratic:0, attenuation_linear:1, attenuation_constant:0, hasShadow: true, shadowMaps:[], shadowVPs: [], shadowMapResolution: 256, shadowBias: 1, shadowSlopeBias: 1.5, shadowNear: 0.01, shadowFar: 100 },
        { type: 'spot', enabled: true, color: vec3.fromValues(5,0,0), position:vec3.fromValues(-2,4,6), direction:vec3.fromValues(0,-1,-1), attenuation_quadratic:0, attenuation_linear:1, attenuation_constant:0, inner_cone: 0.25*Math.PI, outer_cone: 0.3*Math.PI, hasShadow: true, shadowMaps:[], shadowVPs: [], shadowMapResolution: 512, shadowBias: 1, shadowSlopeBias: 1.5, shadowNear: 0.01, shadowFar: 100 },
    ];

    // And we will store the objects here
    objects: {[name: string]: Object3D} = {};

    static readonly MAX_CASCADES = 4; // The maximum number of shadow cascades we support (its a design choice)

    // The cube face directions and up vectors
    static readonly PointShadowDirections = [
        [-1,  0,  0],
        [ 0, -1,  0],
        [ 0,  0, -1],
        [ 1,  0,  0],
        [ 0,  1,  0],
        [ 0,  0,  1]
    ];

    static readonly PointShadowUps = [
        [ 0, -1,  0],
        [ 0,  0, -1],
        [ 0, -1,  0],
        [ 0, -1,  0],
        [ 0,  0, -1],
        [ 0, -1,  0]
    ];

    public load(): void {
        // We need shaders designed to support shadow maps
        // We also need shaders for drawing shadow maps (shadow.vert, shadow.frag)
        this.game.loader.load({
            ["light.vert"]:{url:'shaders/phong/shadow-map/light.vert', type:'text'},
            ["ambient.frag"]:{url:'shaders/phong/shadow-map/ambient.frag', type:'text'},
            ["directional.frag"]:{url:'shaders/phong/shadow-map/directional.frag', type:'text'},
            ["point.frag"]:{url:'shaders/phong/shadow-map/point.frag', type:'text'},
            ["spot.frag"]:{url:'shaders/phong/shadow-map/spot.frag', type:'text'},
            ["shadow.vert"]:{url:'shaders/phong/shadow-map/shadow.vert', type:'text'},
            ["shadow.frag"]:{url:'shaders/phong/shadow-map/shadow.frag', type:'text'},
            ["suzanne"]:{url:'models/Suzanne/Suzanne.obj', type:'text'},
            ["house"]:{url:'models/House/House.obj', type:'text'},
            ["wood.albedo"]:{url:'images/Wood/albedo.jpg', type:'image'},
            ["wood.roughness"]:{url:'images/Wood/roughness.jpg', type:'image'},
            ["wood.specular"]:{url:'images/Wood/specular.jpg', type:'image'},
            ["suzanne.ao"]:{url:'images/Suzanne/ambient_occlusion.jpg', type:'image'},
            ["house.albedo"]:{url:'models/House/House.jpeg', type:'image'},
        });
    } 
    
    public start(): void {
        // For each light type, compile and link a shader
        for(let type of ['ambient', 'directional', 'point', 'spot']){
            this.programs[type] = new ShaderProgram(this.gl);
            this.programs[type].attach(this.game.loader.resources['light.vert'], this.gl.VERTEX_SHADER);
            this.programs[type].attach(this.game.loader.resources[`${type}.frag`], this.gl.FRAGMENT_SHADER);
            this.programs[type].link();
        }

        // Create a shader for drawing shadow maps
        this.programs['shadow'] = new ShaderProgram(this.gl);
        this.programs['shadow'].attach(this.game.loader.resources['shadow.vert'], this.gl.VERTEX_SHADER);
        this.programs['shadow'].attach(this.game.loader.resources['shadow.frag'], this.gl.FRAGMENT_SHADER);
        this.programs['shadow'].link();

        // Load the models
        this.meshes['ground'] = MeshUtils.Plane(this.gl, {min:[0,0], max:[50,50]});
        this.meshes['suzanne'] = MeshUtils.LoadOBJMesh(this.gl, this.game.loader.resources["suzanne"]);
        this.meshes['house'] = MeshUtils.LoadOBJMesh(this.gl, this.game.loader.resources["house"]);

        // Load the textures
        this.textures['wood.albedo'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['wood.albedo']);
        this.textures['wood.roughness'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['wood.roughness']);
        this.textures['wood.specular'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['wood.specular']);
        this.textures['suzanne.ao'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['suzanne.ao']);
        this.textures['house.albedo'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['house.albedo']);
        this.textures['ground.albedo'] = TextureUtils.CheckerBoard(this.gl, [1024, 1024], [256, 256], [26, 26, 26, 255], [196, 196, 196, 255]);
        this.textures['ground.specular'] = TextureUtils.CheckerBoard(this.gl, [1024, 1024], [256, 256], [255, 255, 255, 255], [64, 64, 64, 255]);
        this.textures['ground.roughness'] = TextureUtils.CheckerBoard(this.gl, [1024, 1024], [256, 256], [52, 52, 52, 255], [245, 245, 245, 255]);
        this.textures['white'] = TextureUtils.SingleColor(this.gl, [255, 255, 255, 255]);
        this.textures['black'] = TextureUtils.SingleColor(this.gl, [0, 0, 0, 255]);
        this.textures['grey'] = TextureUtils.SingleColor(this.gl, [128, 128, 128, 255]);

        // Create the 3D ojbects
        this.objects['ground'] = {
            mesh: this.meshes['ground'],
            material: {
                albedo: this.textures['ground.albedo'],
                albedo_tint: vec3.fromValues(1, 1, 1),
                specular: this.textures['ground.specular'],
                specular_tint: vec3.fromValues(1, 1, 1),
                roughness: this.textures['ground.roughness'],
                roughness_scale: 1,
                emissive: this.textures['black'],
                emissive_tint: vec3.fromValues(1, 1, 1),
                ambient_occlusion: this.textures['white']
            },
            modelMatrix: mat4.fromRotationTranslationScale(mat4.create(), quat.create(), vec3.fromValues(0, 0, 0), vec3.fromValues(100, 1, 100))
        };

        this.objects['house'] = {
            mesh: this.meshes['house'],
            material: {
                albedo: this.textures['house.albedo'],
                albedo_tint: vec3.fromValues(1, 1, 1),
                specular: this.textures['black'],
                specular_tint: vec3.fromValues(1, 1, 1),
                roughness: this.textures['grey'],
                roughness_scale: 1,
                emissive: this.textures['black'],
                emissive_tint: vec3.fromValues(1, 1, 1),
                ambient_occlusion: this.textures['white']
            },
            modelMatrix: mat4.fromRotationTranslationScale(mat4.create(), quat.create(), vec3.fromValues(0, 0, 0), vec3.fromValues(1, 1, 1))
        };

        this.objects['wood suzanne'] = {
            mesh: this.meshes['suzanne'],
            material: {
                albedo: this.textures['wood.albedo'],
                albedo_tint: vec3.fromValues(1, 1, 1),
                specular: this.textures['wood.specular'],
                specular_tint: vec3.fromValues(1, 1, 1),
                roughness: this.textures['wood.roughness'],
                roughness_scale: 1,
                emissive: this.textures['black'],
                emissive_tint: vec3.fromValues(1, 1, 1),
                ambient_occlusion: this.textures['suzanne.ao']
            },
            modelMatrix: mat4.fromRotationTranslationScale(mat4.create(), quat.create(), vec3.fromValues(-2, 1, 4), vec3.fromValues(1, 1, 1))
        };

        // Create a regular sampler for textures rendered on the scene objects
        this.samplers['regular'] = this.gl.createSampler();
        this.gl.samplerParameteri(this.samplers['regular'], this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
        this.gl.samplerParameteri(this.samplers['regular'], this.gl.TEXTURE_WRAP_T, this.gl.REPEAT);
        this.gl.samplerParameteri(this.samplers['regular'], this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.samplerParameteri(this.samplers['regular'], this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);

        // Create a sampler for reading from shadow map textures using sampler2DShadow
        // sampler2DShadow compares the depth of the pixel with a reference and returns 1 or 0
        // When using sampler2DShadow, we need to define the compare function (less for shadow maps) and what to compare to (the reference which will be supplied in the shader)
        // When using Linear Filtering with sampler2DShadow, comparison will be done for the 4 neighboring pixels and an interpolated result is retrieved so the result will be in the range [0, 1]
        this.samplers['shadow'] = this.gl.createSampler();
        this.gl.samplerParameteri(this.samplers['shadow'], this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.samplerParameteri(this.samplers['shadow'], this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.samplerParameteri(this.samplers['shadow'], this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.samplerParameteri(this.samplers['shadow'], this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.samplerParameteri(this.samplers['shadow'], this.gl.TEXTURE_COMPARE_FUNC, this.gl.LESS);
        this.gl.samplerParameteri(this.samplers['shadow'], this.gl.TEXTURE_COMPARE_MODE, this.gl.COMPARE_REF_TO_TEXTURE);

        // Now we need to allocate the shadow maps
        // Since shadow maps are depth textures, we can use one of the depth component formats. Here we use DEPTH_COMPONENT32F which is honsetly an overkill, we could use some smaller such as DEPTH_COMPONENT16 and DEPTH_COMPONENT24
        for(let light of this.lights){
            if(light.type == "spot"){
                // spot lights need 1 shadow map only
                light.shadowMaps[0] = TextureUtils.RenderTexture(this.gl, [light.shadowMapResolution, light.shadowMapResolution], this.gl.DEPTH_COMPONENT32F);
            } else if(light.type == "directional"){
                // spot lights need 1 shadow map for each cascade
                for(let i = 0; i < light.cascades.length; i++) light.shadowMaps[i] = TextureUtils.RenderTexture(this.gl, [light.shadowMapResolution, light.shadowMapResolution], this.gl.DEPTH_COMPONENT32F);
            } else if(light.type == "point"){
                // spot lights need 1 shadow map for each direction (size in total)
                for(let i = 0; i < ShadowMappingScene.PointShadowUps.length; i++) light.shadowMaps[i] = TextureUtils.RenderTexture(this.gl, [light.shadowMapResolution, light.shadowMapResolution], this.gl.DEPTH_COMPONENT32F);
            }
        }

        // We will create one frame buffer for drawing shadow maps
        this.frameBuffer = this.gl.createFramebuffer();

        // Create a camera and a controller
        this.camera = new Camera();
        this.camera.type = 'perspective';
        this.camera.position = vec3.fromValues(5,5,5);
        this.camera.direction = vec3.fromValues(-1,-1,-1);
        this.camera.aspectRatio = this.gl.drawingBufferWidth/this.gl.drawingBufferHeight;
        
        this.controller = new FlyCameraController(this.camera, this.game.input);
        this.controller.movementSensitivity = 0.01;

        // As usual, we enable face culling and depth testing
        this.gl.enable(this.gl.CULL_FACE);
        this.gl.cullFace(this.gl.BACK);
        this.gl.frontFace(this.gl.CCW);

        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);

        // Use a dark grey clear color
        this.gl.clearColor(0.1,0.1,0.1,1);

        this.setupControls();
    }
    
    public draw(deltaTime: number): void {
        this.controller.update(deltaTime); // Update camera

        // first, we need to render the shadow maps
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.frameBuffer); // so we bind our frame buffer
        let shadowProgram = this.programs['shadow']; 
        shadowProgram.use(); // Use the shadow program
        this.gl.enable(this.gl.POLYGON_OFFSET_FILL); // enable the polygon offset (we will know why soon)
        // And now for each light, we will render its shadow maps
        for(let light of this.lights){
            if(!light.enabled || !light.hasShadow) continue; // If it is disabled or has no shadow, continue
            // Now we need to build the VP matrices of the light
            if(light.type == "spot"){
                // Spot lights are like one perspective camera looking from the camera position toward the camera direction with a field of view angle equal to double the outer cone angle
                light.shadowVPs[0] = mat4.mul(mat4.create(),
                    mat4.perspective(mat4.create(), 2*light.outer_cone, 1, light.shadowNear, light.shadowFar),
                    mat4.lookAt(mat4.create(), light.position, vec3.add(vec3.create(), light.position, light.direction), perpendicular(light.direction)));
            } else if(light.type == "directional"){
                // Each cascade in the directional light is like an orthographic camera looking from the sky at th world
                // There are many options for choosing the cascade matrices. Here, we use the stable fit algorithm from Unity which is not efficient but easy to implement and removes shadow edge swimming when the camera rotates since the cascades are always axis aligned and centered around the camera
                // But why use cascades instead of one shadow map?
                // Well we can have one shadow map cover the whole world but without a crazily highly resolution, the quality will be horrible
                // On the other side, if the shadow map covers a small area, we won't see shadow outside it which will probably feel unrealistic in open world environments
                // A solution is Cascaded Shadow Map where we use multiple shadow maps, one that cover a small area around the camera and one that covers a vast area with low quality and we can add more cascades in between
                // This will allow us to get good quality on near objects using the first cascade and for farther objects, a large cascade with low quality will not be very noticeable since they are far anyway
                // Usually, the cascade size are organized in an exponential fashion but we free to choose whatever we like. 
                const dir = vec3.normalize(vec3.create(), light.direction);
                // We will assume that the light is away from the camera with the distance of 0.5 * light.shadowDistance
                // Ideally, 0.5 * light.shadowDistance should be equal to the diameter of the world but we can compromise
                const V = mat4.lookAt(mat4.create(), vec3.scaleAndAdd(vec3.create(), this.camera.position,  dir, -light.shadowDistance/2), this.camera.position, perpendicular(light.direction));
                // While all the cascade look in the same direction, they have different area of effect to they need projection matrices with different orthographics sizes
                for(let i = 0; i < light.cascades.length; i++) {
                    const size = light.cascades[i];
                    light.shadowVPs[i] = mat4.mul(mat4.create(), 
                        mat4.ortho(mat4.create(), -size, size, -size, size, 0, light.shadowDistance), 
                        V);
                }
            } else if(light.type == "point"){
                // Points lights are split into 6 perspective cameras, each looking along a specific axis (-x, -y, -z, +x, +y, +z)
                // All the directions have the same projection matrix with a field of view = 90 degrees
                const P = mat4.perspective(mat4.create(), Math.PI/2, 1, light.shadowNear, light.shadowFar);
                // Each matrix has a different view depending on the direction
                for(let i = 0; i < ShadowMappingScene.PointShadowUps.length; i++) {
                    light.shadowVPs[i] = mat4.mul(mat4.create(), 
                        P, 
                        mat4.lookAt(mat4.create(), light.position, vec3.add(vec3.create(), light.position, ShadowMappingScene.PointShadowDirections[i]), ShadowMappingScene.PointShadowUps[i]));
                }
            }

            // For each shadow map in the light, we need to render the scene
            for(let i = 0; i < light.shadowMaps.length; i++){
                // We attach the shadow map texture to the frame buffer 
                this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.DEPTH_ATTACHMENT, this.gl.TEXTURE_2D, light.shadowMaps[i], 0);
                // Quick check to se if it works
                if(this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) != this.gl.FRAMEBUFFER_COMPLETE) console.error("FrameBuffer is Incomplete");
                // Set the viewport to match the shadow map resolution
                this.gl.viewport(0, 0, light.shadowMapResolution, light.shadowMapResolution);
                // We only need to clear the depth
                this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
                // Send the VP matrix
                shadowProgram.setUniformMatrix4fv("VP", false, light.shadowVPs[i]);
                // Here we set the polygon offset to apply shadow bias... but what is bias? and why?
                // Well, this is needed to hide what is called "Shadow Acne". This happens when parts of the triangle is occluded by itself due to the pixelation error on the shadow map
                // Since the triangle will be rasterized into pixels, we only store a discrete version of the triangle depth.
                // However, each triangle pixels on the canvas do not necessarily map to the texel center on the shadow map so it can be slightly nearer or farther.
                // Being slightly nearer is not a problem but being slightly farther will trick the sampler to believe that the pixel is in shadow.
                // Therefore, while drawing shadow maps, we use the polygonOffset to slightly nudge the shadow map away from the light to ensure that no triangle will self occlude
                // But how much do we offset the triangles. Unfortunately, there is no right values.
                // If all the points on the triangle are at the same distance from the light (parallel to the near and far plane), shadow acne will never happen
                // However, as the triangle rotates, this will be no longer true and as the slope increases, the more bias we will need to combat the acne.
                // So we can set the bias to a very high number but then we will face another issue called "Peter-panning" named after peter pan's flying ability
                // This will make object appear as if they don't touch the ground since the large bias will remove the shadows near the object.
                // So ideally, we need to have less bias with less slope and more bias with more slope. We call this Shadow Slope-Scaled Bias.
                // Still, there are no universal values that work for every scene and light so we keep them as tweakable parameters.
                // Note: polygonOffset only works if we enable POLYGON_OFFSET_FILL
                this.gl.polygonOffset(light.shadowSlopeBias, light.shadowBias);
                for(let name in this.objects){
                    let obj = this.objects[name];
                    shadowProgram.setUniformMatrix4fv("M", false, obj.modelMatrix);
                    obj.mesh.draw(this.gl.TRIANGLES);
                }
            }

        }
        // Now we have finished drawing all the shadow maps so we no longer need the POLYGON_OFFSET_FILL
        this.gl.disable(this.gl.POLYGON_OFFSET_FILL);

        // Go back to the canvas frame buffer to draw the scene
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        // Set the viewport to fullscreen
        this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT); // Clear color and depth

        let first_light = true;
        // for each light, draw the whole scene
        for(const light of this.lights){
            if(!light.enabled) continue; // If the light is not enabled, continue

            if(first_light){ // If tihs is the first light, there is no need for blending
                this.gl.disable(this.gl.BLEND);
                first_light = false;
            }else{ // If this in not the first light, we need to blend it additively with all the lights drawn before
                this.gl.enable(this.gl.BLEND);
                this.gl.blendEquation(this.gl.FUNC_ADD);
                this.gl.blendFunc(this.gl.ONE, this.gl.ONE); // This config will make the output = src_color + dest_color
            }

            let program = this.programs[light.type]; // Get the shader to use with this light type
            program.use(); // Use it

            // Send the VP and camera position
            program.setUniformMatrix4fv("VP", false, this.camera.ViewProjectionMatrix);
            program.setUniform3f("cam_position", this.camera.position);

            // Send the light properties depending on its type (remember to normalize the light direction)
            if(light.type == 'ambient'){
                program.setUniform3f(`light.skyColor`, light.skyColor);
                program.setUniform3f(`light.groundColor`, light.groundColor);
                program.setUniform3f(`light.skyDirection`, vec3.normalize(vec3.create(), light.skyDirection));
            } else {
                program.setUniform3f(`light.color`, light.color);
                
                if(light.type == 'directional' || light.type == 'spot'){
                    program.setUniform3f(`light.direction`, vec3.normalize(vec3.create(), light.direction));
                }
                if(light.type == 'point' || light.type == 'spot'){
                    program.setUniform3f(`light.position`, light.position);
                    program.setUniform1f(`light.attenuation_quadratic`, light.attenuation_quadratic);
                    program.setUniform1f(`light.attenuation_linear`, light.attenuation_linear);
                    program.setUniform1f(`light.attenuation_constant`, light.attenuation_constant);
                }
                if(light.type == 'spot'){
                    program.setUniform1f(`light.inner_cone`, light.inner_cone);
                    program.setUniform1f(`light.outer_cone`, light.outer_cone);
                }

                // Tell the shader if this light has shadows
                program.setUniform1f(`light.hasShadow`, light.hasShadow?1:0);
                if(light.hasShadow){
                    // If this light has shadows, we send the shadow maps and VPs
                    for(let i = 0; i < light.shadowMaps.length; i++){
                        program.setUniformMatrix4fv(`light.shadowVPs[${i}]`, false, light.shadowVPs[i]);
                        this.gl.activeTexture(this.gl.TEXTURE5 + i); // We start binding from unit 5 since we use units 0-4 for material properties
                        this.gl.bindTexture(this.gl.TEXTURE_2D, light.shadowMaps[i]);
                        this.gl.bindSampler(5 + i, this.samplers['shadow']);
                        program.setUniform1i(`light.shadowMaps[${i}]`, 5 + i);
                    }
                    // For directional lights, we also need to send the cascade sizes and number of active cascades 
                    if(light.type == 'directional'){
                        program.setUniform1i('light.active_cascades', light.cascades.length);
                        for(let i = 0; i < light.cascades.length; i++){
                            program.setUniform1f(`light.cascades[${i}]`, light.cascades[i]);
                        }
                        // Since GLSL doesn't allow looping on a sampler array where some some samplers are bound the wrong parameters, we bind them to the last shadow map sampler
                        let last = light.shadowMaps.length - 1;
                        for(let i = light.shadowMaps.length; i < ShadowMappingScene.MAX_CASCADES; i++){
                            program.setUniformMatrix4fv(`light.shadowVPs[${i}]`, false, light.shadowVPs[last]);
                            program.setUniform1i(`light.shadowMaps[${i}]`, 5 + last);
                            program.setUniform1f(`light.cascades[${i}]`, light.cascades[last]);
                        }
                    }
                }
            }

            // Loop over objects and draw them
            for(let name in this.objects){
                let obj = this.objects[name];

                // Create model matrix for the object
                program.setUniformMatrix4fv("M", false, obj.modelMatrix);
                program.setUniformMatrix4fv("M_it", true, mat4.invert(mat4.create(), obj.modelMatrix));
                
                // Send material properties and bind the textures
                program.setUniform3f("material.albedo_tint", obj.material.albedo_tint);
                program.setUniform3f("material.specular_tint", obj.material.specular_tint);
                program.setUniform3f("material.emissive_tint", obj.material.emissive_tint);
                program.setUniform1f("material.roughness_scale", obj.material.roughness_scale);

                this.gl.activeTexture(this.gl.TEXTURE0);
                this.gl.bindTexture(this.gl.TEXTURE_2D, obj.material.albedo);
                this.gl.bindSampler(0, this.samplers['regular']);
                program.setUniform1i("material.albedo", 0);

                this.gl.activeTexture(this.gl.TEXTURE1);
                this.gl.bindTexture(this.gl.TEXTURE_2D, obj.material.specular);
                this.gl.bindSampler(1, this.samplers['regular']);
                program.setUniform1i("material.specular", 1);

                this.gl.activeTexture(this.gl.TEXTURE2);
                this.gl.bindTexture(this.gl.TEXTURE_2D, obj.material.roughness);
                this.gl.bindSampler(2, this.samplers['regular']);
                program.setUniform1i("material.roughness", 2);

                this.gl.activeTexture(this.gl.TEXTURE3);
                this.gl.bindTexture(this.gl.TEXTURE_2D, obj.material.emissive);
                this.gl.bindSampler(3, this.samplers['regular']);
                program.setUniform1i("material.emissive", 3);

                this.gl.activeTexture(this.gl.TEXTURE4);
                this.gl.bindTexture(this.gl.TEXTURE_2D, obj.material.ambient_occlusion);
                this.gl.bindSampler(4, this.samplers['regular']);
                program.setUniform1i("material.ambient_occlusion", 4);

                // Draw the object
                obj.mesh.draw(this.gl.TRIANGLES);
            }   
        }
    }
    
    public end(): void {
        for(let key in this.programs)
            this.programs[key].dispose();
        this.programs = {};
        for(let key in this.meshes)
            this.meshes[key].dispose();
        this.meshes = {};
        this.clearControls();
    }


    /////////////////////////////////////////////////////////
    ////// ADD CONTROL TO THE WEBPAGE (NOT IMPORTNANT) //////
    /////////////////////////////////////////////////////////
    controls: HTMLElement[];
    selectedControl: number = 0;

    private setupControls() {
        const controls = document.querySelector('#controls');
        
        this.controls = this.lights.map((light)=>{
            if(light.type == 'ambient'){
                return <div>
                    <div className="control-row">
                        <CheckBox value={light.enabled} onchange={(v)=>{light.enabled=v;}}/>
                        <label className="control-label">Ambient Light</label>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Sky Color</label>
                        <Color color={light.skyColor}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Ground Color</label>
                        <Color color={light.groundColor}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Sky Direction</label>
                        <Vector vector={light.skyDirection}/>
                    </div>
                </div>
            } else if(light.type == 'directional'){
                return <div>
                    <div className="control-row">
                        <CheckBox value={light.enabled} onchange={(v)=>{light.enabled=v;}}/>
                        <label className="control-label">Directional Light</label>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Color</label>
                        <Color color={light.color}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Direction</label>
                        <Vector vector={light.direction}/>
                    </div>
                    <div className="control-row">
                        <CheckBox value={light.hasShadow} onchange={(v)=>{light.hasShadow=v;}}/>
                        <label className="control-label">Shadow Casting</label>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Shadow Distance</label>
                        <NumberInput value={light.shadowDistance} onchange={(v)=>{light.shadowDistance=v;}}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Shadow Bias</label>
                        <NumberInput value={light.shadowBias} onchange={(v)=>{light.shadowBias=v;}}/>
                        <label className="control-label">Shadow Slope Bias</label>
                        <NumberInput value={light.shadowSlopeBias} onchange={(v)=>{light.shadowSlopeBias=v;}}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Cascades</label>
                        {light.cascades.map((v,i)=>{return <NumberInput value={light.cascades[i]} onchange={(v)=>{light.cascades[i]=v;}}/>})}
                    </div>
                </div>;
            } else if(light.type == 'point'){
                return <div>
                    <div className="control-row">
                        <CheckBox value={light.enabled} onchange={(v)=>{light.enabled=v;}}/>
                        <label className="control-label">Point Light</label>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Color</label>
                        <Color color={light.color}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Position</label>
                        <Vector vector={light.position}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Attenuation</label>
                        <label className="control-label">D^2</label>
                        <NumberInput value={light.attenuation_quadratic} onchange={(v)=>{light.attenuation_quadratic=v;}}/>
                        <label className="control-label">D^1</label>
                        <NumberInput value={light.attenuation_linear} onchange={(v)=>{light.attenuation_linear=v;}}/>
                        <label className="control-label">D^0</label>
                        <NumberInput value={light.attenuation_constant} onchange={(v)=>{light.attenuation_constant=v;}}/>
                    </div>
                    <div className="control-row">
                        <CheckBox value={light.hasShadow} onchange={(v)=>{light.hasShadow=v;}}/>
                        <label className="control-label">Shadow Casting</label>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Shadow Near</label>
                        <NumberInput value={light.shadowNear} onchange={(v)=>{light.shadowNear=v;}}/>
                        <label className="control-label">Shadow Far</label>
                        <NumberInput value={light.shadowFar} onchange={(v)=>{light.shadowFar=v;}}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Shadow Bias</label>
                        <NumberInput value={light.shadowBias} onchange={(v)=>{light.shadowBias=v;}}/>
                        <label className="control-label">Shadow Slope Bias</label>
                        <NumberInput value={light.shadowSlopeBias} onchange={(v)=>{light.shadowSlopeBias=v;}}/>
                    </div>
                </div>;
            } else if(light.type == 'spot'){
                return <div>
                    <div className="control-row">
                        <CheckBox value={light.enabled} onchange={(v)=>{light.enabled=v;}}/>
                        <label className="control-label">Spot Light</label>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Color</label>
                        <Color color={light.color}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Position</label>
                        <Vector vector={light.position}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Direction</label>
                        <Vector vector={light.direction}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Attenuation</label>
                        <label className="control-label">D^2</label>
                        <NumberInput value={light.attenuation_quadratic} onchange={(v)=>{light.attenuation_quadratic=v;}}/>
                        <label className="control-label">D^1</label>
                        <NumberInput value={light.attenuation_linear} onchange={(v)=>{light.attenuation_linear=v;}}/>
                        <label className="control-label">D^0</label>
                        <NumberInput value={light.attenuation_constant} onchange={(v)=>{light.attenuation_constant=v;}}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Inner Cone</label>
                        <NumberInput value={light.inner_cone * 180 / Math.PI} onchange={(v)=>{light.inner_cone=v * Math.PI / 180;}}/>
                        <label className="control-label">Outer Cone</label>
                        <NumberInput value={light.outer_cone * 180 / Math.PI} onchange={(v)=>{light.outer_cone=v * Math.PI / 180;}}/>
                    </div>
                    <div className="control-row">
                        <CheckBox value={light.hasShadow} onchange={(v)=>{light.hasShadow=v;}}/>
                        <label className="control-label">Shadow Casting</label>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Shadow Near</label>
                        <NumberInput value={light.shadowNear} onchange={(v)=>{light.shadowNear=v;}}/>
                        <label className="control-label">Shadow Far</label>
                        <NumberInput value={light.shadowFar} onchange={(v)=>{light.shadowFar=v;}}/>
                    </div>
                    <div className="control-row">
                        <label className="control-label">Shadow Bias</label>
                        <NumberInput value={light.shadowBias} onchange={(v)=>{light.shadowBias=v;}}/>
                        <label className="control-label">Shadow Slope Bias</label>
                        <NumberInput value={light.shadowSlopeBias} onchange={(v)=>{light.shadowSlopeBias=v;}}/>
                    </div>
                </div>;
            }
        });

        this.controls.forEach((control, index)=>{ control.setAttribute('style', `display:${index==this.selectedControl?'block':'none'}`)});
        

        controls.appendChild(
            <div>
                <div className="control-row">
                    <label className="control-label">Light</label>
                    <Selector 
                        options={Object.fromEntries(this.controls.map((v,i)=>[i,i.toString()]))} 
                        value={this.selectedControl} 
                        onchange={(v)=>{
                            this.selectedControl = v;
                            this.controls.forEach((control, index)=>{ control.setAttribute('style', `display:${index==this.selectedControl?'block':'none'}`)});
                        }}
                    />
                </div>
                {this.controls}
            </div>
            
        );
        
    }

    private clearControls() {
        const controls = document.querySelector('#controls');
        controls.innerHTML = "";
    }


}