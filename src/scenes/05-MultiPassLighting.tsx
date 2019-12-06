import { Scene } from '../common/game';
import ShaderProgram from '../common/shader-program';
import Mesh from '../common/mesh';
import * as MeshUtils from '../common/mesh-utils';
import Camera from '../common/camera';
import FlyCameraController from '../common/camera-controllers/fly-camera-controller';
import { vec3, mat4 } from 'gl-matrix';
import { Vector, Selector, Color, NumberInput, CheckBox } from '../common/dom-utils';
import { createElement } from 'tsx-create-element';

// It is better to create interfaces for each type of light for organization (think of them as structs)
interface DirectionalLight {
    type: 'directional',
    enabled: boolean,
    diffuse: vec3,
    specular: vec3,
    ambient: vec3,
    direction: vec3
};

interface PointLight {
    type: 'point',
    enabled: boolean,
    diffuse: vec3,
    specular: vec3,
    ambient: vec3,
    position: vec3,
    attenuation_quadratic: number,
    attenuation_linear: number,
    attenuation_constant: number
};

interface SpotLight {
    type: 'spot',
    enabled: boolean,
    diffuse: vec3,
    specular: vec3,
    ambient: vec3,
    position: vec3,
    direction: vec3,
    attenuation_quadratic: number,
    attenuation_linear: number,
    attenuation_constant: number,
    inner_cone: number,
    outer_cone: number
};

// This union type: it can be any of the specified types
type Light = DirectionalLight | PointLight | SpotLight;

// In this scene we will draw some monkeys with multiple lights using blending and multiple shaders
export default class MultiPassLightingsScene extends Scene {
    programs: {[name: string]: ShaderProgram} = {};
    camera: Camera;
    controller: FlyCameraController;
    meshes: {[name: string]: Mesh} = {};

    // This will store our material properties
    material = {
        diffuse: vec3.fromValues(0.5,0.3,0.1),
        specular: vec3.fromValues(1,1,1),
        ambient: vec3.fromValues(0.5,0.3,0.1),
        shininess: 20
    };

    // And these will store our light properties together in list
    lights: Light[] = [
        { type: 'directional', enabled: true, diffuse: vec3.fromValues(0.5,0.5,0.5), specular:vec3.fromValues(0.5,0.5,0.5), ambient:vec3.fromValues(0.1,0.1,0.1), direction:vec3.fromValues(-1,-1,-1) },
        { type: 'point', enabled: true, diffuse: vec3.fromValues(1,0,0), specular:vec3.fromValues(1,0,0), ambient:vec3.fromValues(0.1,0.0,0.0), position:vec3.fromValues(+6,+1,+0), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0 },
        { type: 'point', enabled: true, diffuse: vec3.fromValues(0,1,0), specular:vec3.fromValues(0,1,0), ambient:vec3.fromValues(0.0,0.1,0.0), position:vec3.fromValues(-6,+1,+0), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0 },
        { type: 'point', enabled: true, diffuse: vec3.fromValues(0,0,1), specular:vec3.fromValues(0,0,1), ambient:vec3.fromValues(0.0,0.0,0.1), position:vec3.fromValues(+0,+1,+6), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0 },
        { type: 'point', enabled: true, diffuse: vec3.fromValues(1,1,0), specular:vec3.fromValues(1,1,0), ambient:vec3.fromValues(0.1,0.1,0.0), position:vec3.fromValues(+0,+1,-6), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0 },
        { type: 'spot', enabled: true, diffuse: vec3.fromValues(5,0,0), specular:vec3.fromValues(5,0,0), ambient:vec3.fromValues(0.1,0.0,0.0), position:vec3.fromValues(+3,+1,+3), direction:vec3.fromValues(-1,0,-1), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0, inner_cone: 0.25*Math.PI, outer_cone: 0.3*Math.PI },
        { type: 'spot', enabled: true, diffuse: vec3.fromValues(0,5,0), specular:vec3.fromValues(0,5,0), ambient:vec3.fromValues(0.0,0.1,0.0), position:vec3.fromValues(-3,+1,+3), direction:vec3.fromValues(+1,0,-1), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0, inner_cone: 0.25*Math.PI, outer_cone: 0.3*Math.PI  },
        { type: 'spot', enabled: true, diffuse: vec3.fromValues(0,0,5), specular:vec3.fromValues(0,0,5), ambient:vec3.fromValues(0.0,0.0,0.1), position:vec3.fromValues(+3,+1,-3), direction:vec3.fromValues(-1,0,+1), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0, inner_cone: 0.25*Math.PI, outer_cone: 0.3*Math.PI  },
        { type: 'spot', enabled: true, diffuse: vec3.fromValues(5,5,0), specular:vec3.fromValues(5,5,0), ambient:vec3.fromValues(0.1,0.1,0.0), position:vec3.fromValues(-3,+1,-3), direction:vec3.fromValues(+1,0,+1), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0, inner_cone: 0.25*Math.PI, outer_cone: 0.3*Math.PI  },
    ];

    public load(): void {
        // We need multiple shaders; one for each light type. Luckily, they are the same as the ones we used in each single light scene
        this.game.loader.load({
            ["directional.vert"]:{url:'shaders/phong/single-light/directional.vert', type:'text'},
            ["directional.frag"]:{url:'shaders/phong/single-light/directional.frag', type:'text'},
            ["point.vert"]:{url:'shaders/phong/single-light/point.vert', type:'text'},
            ["point.frag"]:{url:'shaders/phong/single-light/point.frag', type:'text'},
            ["spot.vert"]:{url:'shaders/phong/single-light/spot.vert', type:'text'},
            ["spot.frag"]:{url:'shaders/phong/single-light/spot.frag', type:'text'},
            ["suzanne"]:{url:'models/Suzanne/Suzanne.obj', type:'text'},
        });
    } 
    
    public start(): void {
        // Compile and Link a shader for each light type
        for(let type of ['directional', 'point', 'spot']){
            this.programs[type] = new ShaderProgram(this.gl);
            this.programs[type].attach(this.game.loader.resources[`${type}.vert`], this.gl.VERTEX_SHADER);
            this.programs[type].attach(this.game.loader.resources[`${type}.frag`], this.gl.FRAGMENT_SHADER);
            this.programs[type].link();
        }

        // Load the models
        this.meshes['ground'] = MeshUtils.Plane(this.gl, {min:[0,0], max:[100,100]});
        this.meshes['suzanne'] = MeshUtils.LoadOBJMesh(this.gl, this.game.loader.resources["suzanne"]);

        // Create a camera and a controller
        this.camera = new Camera();
        this.camera.type = 'perspective';
        this.camera.position = vec3.fromValues(5,5,5);
        this.camera.direction = vec3.fromValues(-1,-1,-1);
        this.camera.aspectRatio = this.gl.drawingBufferWidth/this.gl.drawingBufferHeight;
        
        // As usual, we enable face culling and depth testing
        this.controller = new FlyCameraController(this.camera, this.game.input);
        this.controller.movementSensitivity = 0.01;

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
            program.setUniform3f(`light.diffuse`, light.diffuse);
            program.setUniform3f(`light.specular`, light.specular);
            program.setUniform3f(`light.ambient`, light.ambient);
            
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

            // Create model matrix for the ground
            let groundM = mat4.create();
            mat4.scale(groundM, groundM, [100, 1, 100]);

            // Send M for position and M inverse transpose for normals
            program.setUniformMatrix4fv("M", false, groundM);
            program.setUniformMatrix4fv("M_it", true, mat4.invert(mat4.create(), groundM));
            // Send material properties
            program.setUniform3f("material.diffuse", [0.5,0.5,0.5]);
            program.setUniform3f("material.specular", [0.2,0.2,0.2]);
            program.setUniform3f("material.ambient", [0.1,0.1,0.1]);
            program.setUniform1f("material.shininess", 2);

            // Draw the ground
            this.meshes['ground'].draw(this.gl.TRIANGLES);

            // Do the same for all the monkeys
            for(let i = -1; i <= 1; i++){
                for(let j = -1; j <= 1; j++){
                    let M = mat4.create();
                    mat4.translate(M, M, [i*4, 1, j*4]);
            
                    program.setUniformMatrix4fv("M", false, M);
                    program.setUniformMatrix4fv("M_it", true, mat4.invert(mat4.create(), M));
                    program.setUniform3f("material.diffuse", this.material.diffuse);
                    program.setUniform3f("material.specular", this.material.specular);
                    program.setUniform3f("material.ambient", this.material.ambient);
                    program.setUniform1f("material.shininess", this.material.shininess);
            
                    this.meshes['suzanne'].draw(this.gl.TRIANGLES);
                }
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