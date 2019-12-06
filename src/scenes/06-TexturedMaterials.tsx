import { Scene } from '../common/game';
import ShaderProgram from '../common/shader-program';
import Mesh from '../common/mesh';
import * as MeshUtils from '../common/mesh-utils';
import * as TextureUtils from '../common/texture-utils';
import Camera from '../common/camera';
import FlyCameraController from '../common/camera-controllers/fly-camera-controller';
import { vec3, mat4, quat } from 'gl-matrix';
import { Vector, Selector, Color, NumberInput, CheckBox } from '../common/dom-utils';
import { createElement } from 'tsx-create-element';

// It is better to create interfaces for each type of light for organization (think of them as structs)
// We simplify things here and consider the light to have only one color
// Also we separate the ambient light into its own light and make it a hemispherical light (the ambient differs according to the direction)
interface AmbientLight {
    type: 'ambient',
    enabled: boolean,
    skyColor: vec3,
    groundColor: vec3,
    skyDirection: vec3
};

interface DirectionalLight {
    type: 'directional',
    enabled: boolean,
    color: vec3,
    direction: vec3
};

interface PointLight {
    type: 'point',
    enabled: boolean,
    color: vec3,
    position: vec3,
    attenuation_quadratic: number,
    attenuation_linear: number,
    attenuation_constant: number
};

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
    outer_cone: number
};

// This union type: it can be any of the specified types
type Light = AmbientLight | DirectionalLight | PointLight | SpotLight;

// This will store the material properties
// To be more consistent with modern workflows, we use what is called albedo to define the diffuse and ambient
// And since specular power (shininess) is in the range 0 to infinity and the more popular roughness paramater is in the range 0 to 1, we read the roughness from the image and convert it to shininess (specular power)
// We also add an emissive properties in case the object itself emits light
// Finally, while the ambient is naturally the same a the diffuse, some areas recieve less ambient than other (e.g. folds), so we use the ambient occlusion texture to darken the ambient in these areas
// We also add tints and scales to control the properties without using multiple textures
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

// In this scene we will draw some textured monkeys with multiple lights using blending and multiple shaders
export default class TexturedMaterialsScene extends Scene {
    programs: {[name: string]: ShaderProgram} = {};
    camera: Camera;
    controller: FlyCameraController;
    meshes: {[name: string]: Mesh} = {};
    textures: {[name: string]: WebGLTexture} = {};
    samplers: {[name: string]: WebGLSampler} = {};

    // We will store the lights here
    lights: Light[] = [
        { type: "ambient", enabled: true, skyColor: vec3.fromValues(0.2, 0.3, 0.4), groundColor: vec3.fromValues(0.1, 0.1, 0.1), skyDirection: vec3.fromValues(0,1,0)},
        { type: 'directional', enabled: true, color: vec3.fromValues(0.5,0.5,0.5), direction:vec3.fromValues(-1,-1,-1) },
        { type: 'point', enabled: true, color: vec3.fromValues(1,0,0), position:vec3.fromValues(+6,+1,+0), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0 },
        { type: 'point', enabled: true, color: vec3.fromValues(0,1,0), position:vec3.fromValues(-6,+1,+0), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0 },
        { type: 'point', enabled: true, color: vec3.fromValues(0,0,1), position:vec3.fromValues(+0,+1,+6), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0 },
        { type: 'point', enabled: true, color: vec3.fromValues(1,1,0), position:vec3.fromValues(+0,+1,-6), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0 },
        { type: 'spot', enabled: true, color: vec3.fromValues(5,0,0), position:vec3.fromValues(+3,+1,+3), direction:vec3.fromValues(-1,0,-1), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0, inner_cone: 0.25*Math.PI, outer_cone: 0.3*Math.PI },
        { type: 'spot', enabled: true, color: vec3.fromValues(0,5,0), position:vec3.fromValues(-3,+1,+3), direction:vec3.fromValues(+1,0,-1), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0, inner_cone: 0.25*Math.PI, outer_cone: 0.3*Math.PI  },
        { type: 'spot', enabled: true, color: vec3.fromValues(0,0,5), position:vec3.fromValues(+3,+1,-3), direction:vec3.fromValues(-1,0,+1), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0, inner_cone: 0.25*Math.PI, outer_cone: 0.3*Math.PI  },
        { type: 'spot', enabled: true, color: vec3.fromValues(5,5,0), position:vec3.fromValues(-3,+1,-3), direction:vec3.fromValues(+1,0,+1), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0, inner_cone: 0.25*Math.PI, outer_cone: 0.3*Math.PI  },
    ];

    // And we will store the objects here
    objects: {[name: string]: Object3D} = {};

    public load(): void {
        // All the lights will use the same vertex shader combined with different fragment shaders
        this.game.loader.load({
            ["light.vert"]:{url:'shaders/phong/textured-materials/light.vert', type:'text'},
            ["ambient.frag"]:{url:'shaders/phong/textured-materials/ambient.frag', type:'text'},
            ["directional.frag"]:{url:'shaders/phong/textured-materials/directional.frag', type:'text'},
            ["point.frag"]:{url:'shaders/phong/textured-materials/point.frag', type:'text'},
            ["spot.frag"]:{url:'shaders/phong/textured-materials/spot.frag', type:'text'},
            ["suzanne"]:{url:'models/Suzanne/Suzanne.obj', type:'text'},
            ["asphalt.albedo"]:{url:'images/Asphalt/albedo.jpg', type:'image'},
            ["asphalt.emissive"]:{url:'images/Asphalt/emissive.jpg', type:'image'},
            ["asphalt.roughness"]:{url:'images/Asphalt/roughness.jpg', type:'image'},
            ["asphalt.specular"]:{url:'images/Asphalt/specular.jpg', type:'image'},
            ["metal.albedo"]:{url:'images/Metal/albedo.jpg', type:'image'},
            ["metal.roughness"]:{url:'images/Metal/roughness.jpg', type:'image'},
            ["metal.specular"]:{url:'images/Metal/specular.jpg', type:'image'},
            ["wood.albedo"]:{url:'images/Wood/albedo.jpg', type:'image'},
            ["wood.roughness"]:{url:'images/Wood/roughness.jpg', type:'image'},
            ["wood.specular"]:{url:'images/Wood/specular.jpg', type:'image'},
            ["suzanne.ao"]:{url:'images/Suzanne/ambient_occlusion.jpg', type:'image'},
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

        // Load the models
        this.meshes['ground'] = MeshUtils.Plane(this.gl, {min:[0,0], max:[50,50]});
        this.meshes['suzanne'] = MeshUtils.LoadOBJMesh(this.gl, this.game.loader.resources["suzanne"]);

        // Load the textures
        this.textures['asphalt.albedo'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['asphalt.albedo']);
        this.textures['asphalt.emissive'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['asphalt.emissive']);
        this.textures['asphalt.roughness'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['asphalt.roughness']);
        this.textures['asphalt.specular'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['asphalt.specular']);
        this.textures['metal.albedo'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['metal.albedo']);
        this.textures['metal.roughness'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['metal.roughness']);
        this.textures['metal.specular'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['metal.specular']);
        this.textures['wood.albedo'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['wood.albedo']);
        this.textures['wood.roughness'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['wood.roughness']);
        this.textures['wood.specular'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['wood.specular']);
        this.textures['suzanne.ao'] = TextureUtils.LoadImage(this.gl, this.game.loader.resources['suzanne.ao']);
        this.textures['ground.albedo'] = TextureUtils.CheckerBoard(this.gl, [1024, 1024], [256, 256], [26, 26, 26, 255], [196, 196, 196, 255]);
        this.textures['ground.specular'] = TextureUtils.CheckerBoard(this.gl, [1024, 1024], [256, 256], [255, 255, 255, 255], [64, 64, 64, 255]);
        this.textures['ground.roughness'] = TextureUtils.CheckerBoard(this.gl, [1024, 1024], [256, 256], [52, 52, 52, 255], [245, 245, 245, 255]);
        this.textures['white'] = TextureUtils.SingleColor(this.gl, [255, 255, 255, 255]);
        this.textures['black'] = TextureUtils.SingleColor(this.gl, [0, 0, 0, 255]);

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

        this.objects['asphalt suzanne'] = {
            mesh: this.meshes['suzanne'],
            material: {
                albedo: this.textures['asphalt.albedo'],
                albedo_tint: vec3.fromValues(1, 1, 1),
                specular: this.textures['asphalt.specular'],
                specular_tint: vec3.fromValues(1, 1, 1),
                roughness: this.textures['asphalt.roughness'],
                roughness_scale: 1,
                emissive: this.textures['asphalt.emissive'],
                emissive_tint: vec3.fromValues(1, 1, 1),
                ambient_occlusion: this.textures['suzanne.ao']
            },
            modelMatrix: mat4.fromRotationTranslationScale(mat4.create(), quat.create(), vec3.fromValues(-4, 1, 0), vec3.fromValues(1, 1, 1))
        };

        
        this.objects['metal suzanne'] = {
            mesh: this.meshes['suzanne'],
            material: {
                albedo: this.textures['metal.albedo'],
                albedo_tint: vec3.fromValues(1, 1, 1),
                specular: this.textures['metal.specular'],
                specular_tint: vec3.fromValues(1, 1, 1),
                roughness: this.textures['metal.roughness'],
                roughness_scale: 1,
                emissive: this.textures['black'],
                emissive_tint: vec3.fromValues(1, 1, 1),
                ambient_occlusion: this.textures['suzanne.ao']
            },
            modelMatrix: mat4.fromRotationTranslationScale(mat4.create(), quat.create(), vec3.fromValues(0, 1, 0), vec3.fromValues(1, 1, 1))
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
            modelMatrix: mat4.fromRotationTranslationScale(mat4.create(), quat.create(), vec3.fromValues(4, 1, 0), vec3.fromValues(1, 1, 1))
        };

        // Create a regular sampler for textures rendered on the scene objects
        this.samplers['regular'] = this.gl.createSampler();
        this.gl.samplerParameteri(this.samplers['regular'], this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
        this.gl.samplerParameteri(this.samplers['regular'], this.gl.TEXTURE_WRAP_T, this.gl.REPEAT);
        this.gl.samplerParameteri(this.samplers['regular'], this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.samplerParameteri(this.samplers['regular'], this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);

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
                program.setUniform3f(`light.skyDirection`, light.skyDirection);
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
    private setupControls() {
        const controls = document.querySelector('#controls');
        
        

        controls.appendChild(
            <div>
                <div className="control-row">
                    <label className="control-label">Lights</label>
                    {this.lights.map((light)=>{
                        return <CheckBox value={light.enabled} onchange={(v)=>{light.enabled=v;}}/>
                    })}
                </div>
            </div>
            
        );
        
    }

    private clearControls() {
        const controls = document.querySelector('#controls');
        controls.innerHTML = "";
    }


}