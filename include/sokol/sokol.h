#if defined(__APPLE__)
  #include <TargetConditionals.h>
#endif

#define SOKOL_NO_ENTRY
#define SOKOL_NO_DEPRECATED
#define SOKOL_GLCORE33

#include "glad/glad.h"
#include "sokol_gfx.h"
#include "sokol_app.h"
