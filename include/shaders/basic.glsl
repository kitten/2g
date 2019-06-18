@vs vs
in vec4 position;
in vec4 color;

out vec4 out_color;

void main() {
    gl_Position = position;
    out_color = color;
}
@end

@fs fs
in vec4 out_color;
out vec4 frag_color;

void main() {
    frag_color = out_color;
}
@end

@program basic vs fs
