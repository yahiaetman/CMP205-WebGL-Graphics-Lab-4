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
    enabled: boolean,
    diffuse: vec3,
    specular: vec3,
    ambient: vec3,
    direction: vec3
};

interface PointLight {
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

// In this scene we will draw some monkeys with multiple lights using one shader
export default class MultipleLightsScene extends Scene {
    program: ShaderProgram;
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

    // And these will store our light properties separated by type
    directional_lights: DirectionalLight[] = [
        { enabled: true, diffuse: vec3.fromValues(0.5,0.5,0.5), specular:vec3.fromValues(0.5,0.5,0.5), ambient:vec3.fromValues(0.1,0.1,0.1), direction:vec3.fromValues(-1,-1,-1) }
    ];

    point_lights: PointLight[] = [
        { enabled: true, diffuse: vec3.fromValues(1,0,0), specular:vec3.fromValues(1,0,0), ambient:vec3.fromValues(0.1,0.0,0.0), position:vec3.fromValues(+6,+1,+0), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0 },
        { enabled: true, diffuse: vec3.fromValues(0,1,0), specular:vec3.fromValues(0,1,0), ambient:vec3.fromValues(0.0,0.1,0.0), position:vec3.fromValues(-6,+1,+0), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0 },
        { enabled: true, diffuse: vec3.fromValues(0,0,1), specular:vec3.fromValues(0,0,1), ambient:vec3.fromValues(0.0,0.0,0.1), position:vec3.fromValues(+0,+1,+6), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0 },
        { enabled: true, diffuse: vec3.fromValues(1,1,0), specular:vec3.fromValues(1,1,0), ambient:vec3.fromValues(0.1,0.1,0.0), position:vec3.fromValues(+0,+1,-6), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0 },
    ];

    spot_lights: SpotLight[] = [
        { enabled: true, diffuse: vec3.fromValues(5,0,0), specular:vec3.fromValues(5,0,0), ambient:vec3.fromValues(0.1,0.0,0.0), position:vec3.fromValues(+3,+1,+3), direction:vec3.fromValues(-1,0,-1), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0, inner_cone: 0.25*Math.PI, outer_cone: 0.3*Math.PI },
        { enabled: true, diffuse: vec3.fromValues(0,5,0), specular:vec3.fromValues(0,5,0), ambient:vec3.fromValues(0.0,0.1,0.0), position:vec3.fromValues(-3,+1,+3), direction:vec3.fromValues(+1,0,-1), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0, inner_cone: 0.25*Math.PI, outer_cone: 0.3*Math.PI  },
        { enabled: true, diffuse: vec3.fromValues(0,0,5), specular:vec3.fromValues(0,0,5), ambient:vec3.fromValues(0.0,0.0,0.1), position:vec3.fromValues(+3,+1,-3), direction:vec3.fromValues(-1,0,+1), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0, inner_cone: 0.25*Math.PI, outer_cone: 0.3*Math.PI  },
        { enabled: true, diffuse: vec3.fromValues(5,5,0), specular:vec3.fromValues(5,5,0), ambient:vec3.fromValues(0.1,0.1,0.0), position:vec3.fromValues(-3,+1,-3), direction:vec3.fromValues(+1,0,+1), attenuation_quadratic:1, attenuation_linear:0, attenuation_constant:0, inner_cone: 0.25*Math.PI, outer_cone: 0.3*Math.PI  },
    ];

    public load(): void {
        // We need one big shader specifically designed to do all the lighting
        this.game.loader.load({
            ["vert"]:{url:'shaders/phong/multiple-lights/lights.vert', type:'text'},
            ["frag"]:{url:'shaders/phong/multiple-lights/lights.frag', type:'text'},
            ["suzanne"]:{url:'models/Suzanne/Suzanne.obj', type:'text'},
        });
    } 
    
    public start(): void {
        // Compile and Link the shader
        this.program = new ShaderProgram(this.gl);
        this.program.attach(this.game.loader.resources["vert"], this.gl.VERTEX_SHADER);
        this.program.attach(this.game.loader.resources["frag"], this.gl.FRAGMENT_SHADER);
        this.program.link();

        // Load the models
        this.meshes['ground'] = MeshUtils.Plane(this.gl, {min:[0,0], max:[100,100]});
        this.meshes['suzanne'] = MeshUtils.LoadOBJMesh(this.gl, this.game.loader.resources["suzanne"]);

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

        // We don't need blending
        this.gl.disable(this.gl.BLEND);

        // Use a dark grey clear color
        this.gl.clearColor(0.1,0.1,0.1,1);

        this.setupControls();
    }
    
    public draw(deltaTime: number): void {
        this.controller.update(deltaTime); // Update camera

        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT); // Clear color and depth
        
        this.program.use(); // Start using the shader for lights

        // Send the VP and camera position
        this.program.setUniformMatrix4fv("VP", false, this.camera.ViewProjectionMatrix);
        this.program.setUniform3f("cam_position", this.camera.position);
        
        // For each light type, send their properties (remember to normalize the light direction)
        this.directional_lights.forEach((light, i)=>{
            this.program.setUniform1f(`directional_lights[${i}].enabled`, light.enabled?1:0);
            this.program.setUniform3f(`directional_lights[${i}].diffuse`, light.diffuse);
            this.program.setUniform3f(`directional_lights[${i}].specular`, light.specular);
            this.program.setUniform3f(`directional_lights[${i}].ambient`, light.ambient);
            this.program.setUniform3f(`directional_lights[${i}].direction`, vec3.normalize(vec3.create(), light.direction));
        });
        this.point_lights.forEach((light, i)=>{
            this.program.setUniform1f(`point_lights[${i}].enabled`, light.enabled?1:0);
            this.program.setUniform3f(`point_lights[${i}].diffuse`, light.diffuse);
            this.program.setUniform3f(`point_lights[${i}].specular`, light.specular);
            this.program.setUniform3f(`point_lights[${i}].ambient`, light.ambient);
            this.program.setUniform3f(`point_lights[${i}].position`, light.position);
            this.program.setUniform1f(`point_lights[${i}].attenuation_quadratic`, light.attenuation_quadratic);
            this.program.setUniform1f(`point_lights[${i}].attenuation_linear`, light.attenuation_linear);
            this.program.setUniform1f(`point_lights[${i}].attenuation_constant`, light.attenuation_constant);
        });
        this.spot_lights.forEach((light, i)=>{
            this.program.setUniform1f(`spot_lights[${i}].enabled`, light.enabled?1:0);
            this.program.setUniform3f(`spot_lights[${i}].diffuse`, light.diffuse);
            this.program.setUniform3f(`spot_lights[${i}].specular`, light.specular);
            this.program.setUniform3f(`spot_lights[${i}].ambient`, light.ambient);
            this.program.setUniform3f(`spot_lights[${i}].position`, light.position);
            this.program.setUniform3f(`spot_lights[${i}].direction`, vec3.normalize(vec3.create(), light.direction));
            this.program.setUniform1f(`spot_lights[${i}].attenuation_quadratic`, light.attenuation_quadratic);
            this.program.setUniform1f(`spot_lights[${i}].attenuation_linear`, light.attenuation_linear);
            this.program.setUniform1f(`spot_lights[${i}].attenuation_constant`, light.attenuation_constant);
            this.program.setUniform1f(`spot_lights[${i}].inner_cone`, light.inner_cone);
            this.program.setUniform1f(`spot_lights[${i}].outer_cone`, light.outer_cone);
        });

        // Create model matrix for the ground
        let groundM = mat4.create();
        mat4.scale(groundM, groundM, [100, 1, 100]);

        // Send M for position and M inverse transpose for normals
        this.program.setUniformMatrix4fv("M", false, groundM);
        this.program.setUniformMatrix4fv("M_it", true, mat4.invert(mat4.create(), groundM));
        // Send material properties
        this.program.setUniform3f("material.diffuse", [0.5,0.5,0.5]);
        this.program.setUniform3f("material.specular", [0.2,0.2,0.2]);
        this.program.setUniform3f("material.ambient", [0.1,0.1,0.1]);
        this.program.setUniform1f("material.shininess", 2);

        // Draw the ground
        this.meshes['ground'].draw(this.gl.TRIANGLES);

        // Do the same for all the monkeys
        for(let i = -1; i <= 1; i++){
            for(let j = -1; j <= 1; j++){
                let M = mat4.create();
                mat4.translate(M, M, [i*4, 1, j*4]);
        
                this.program.setUniformMatrix4fv("M", false, M);
                this.program.setUniformMatrix4fv("M_it", true, mat4.invert(mat4.create(), M));
                this.program.setUniform3f("material.diffuse", this.material.diffuse);
                this.program.setUniform3f("material.specular", this.material.specular);
                this.program.setUniform3f("material.ambient", this.material.ambient);
                this.program.setUniform1f("material.shininess", this.material.shininess);
        
                this.meshes['suzanne'].draw(this.gl.TRIANGLES);
            }
        }
    }
    
    public end(): void {
        this.program.dispose();
        this.program = null;
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
                    <label className="control-label">Directional Lights</label>
                    {this.directional_lights.map((light)=>{
                        return <CheckBox value={light.enabled} onchange={(v)=>{light.enabled=v;}}/>
                    })}
                </div>
                <div className="control-row">
                <label className="control-label">Point Lights</label>
                    {this.point_lights.map((light)=>{
                        return <CheckBox value={light.enabled} onchange={(v)=>{light.enabled=v;}}/>
                    })}
                </div>
                <div className="control-row">
                <label className="control-label">Spot Lights</label>
                    {this.spot_lights.map((light)=>{
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