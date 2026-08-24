use renderer::grid::GridRenderer;
use renderer::pipeline::RenderPipeline;

pub struct GpuTerminalTexture {
    pub texture: wgpu::Texture,
    grid: GridRenderer,
    pipeline: RenderPipeline,
    device: wgpu::Device,
    queue: wgpu::Queue,
    scale: f32,
}

impl GpuTerminalTexture {
    pub fn new(
        device: wgpu::Device,
        queue: wgpu::Queue,
        width: u32,
        height: u32,
        scale: f32,
    ) -> Self {
        use renderer::atlas_gpu::{PackedAtlas, scale_key};

        let atlas = PackedAtlas::get(scale_key(scale));
        let pipeline = RenderPipeline::new(
            &device,
            &queue,
            &atlas.pixels,
            atlas.width,
            atlas.height,
        );
        let grid =
            GridRenderer::new(width, height, theme::Theme::default_dark(), scale);

        let texture = Self::create_texture(&device, width, height);

        let mut this = Self {
            texture,
            grid,
            pipeline,
            device,
            queue,
            scale,
        };
        this.grid.fill_background_only();
        this.draw_gpu();
        this
    }

    fn create_texture(device: &wgpu::Device, width: u32, height: u32) -> wgpu::Texture {
        device.create_texture(&wgpu::TextureDescriptor {
            label: Some("terminal_texture"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_DST
                | wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        })
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        if self.grid.width == width && self.grid.height == height {
            return;
        }
        self.grid.resize(width, height);
        self.texture = Self::create_texture(&self.device, width, height);
        self.grid.fill_background_only();
        self.draw_gpu();
    }

    pub fn width(&self) -> u32 {
        self.grid.width
    }

    pub fn height(&self) -> u32 {
        self.grid.height
    }

    pub fn cell_width(&self) -> f32 {
        self.grid.cell_width()
    }

    pub fn cell_height(&self) -> f32 {
        self.grid.cell_height()
    }

    pub fn cols(&self) -> u16 {
        self.grid.cols()
    }

    pub fn rows(&self) -> u16 {
        self.grid.rows()
    }

    pub fn grid_mut(&mut self) -> &mut GridRenderer {
        &mut self.grid
    }

    pub fn draw_gpu(&mut self) {
        let (bg, glyphs, clear) = self.grid.take_draw_data();
        let theme = self.grid.theme.background;
        let clear_color = [
            theme.r as f32 / 255.0,
            theme.g as f32 / 255.0,
            theme.b as f32 / 255.0,
            1.0,
        ];
        self.pipeline.render(
            &self.device,
            &self.queue,
            &self.texture,
            self.grid.width,
            self.grid.height,
            &bg,
            &glyphs,
            clear,
            clear_color,
        );
    }

    pub fn read_rgba(&self) -> Vec<u8> {
        let width = self.grid.width;
        let height = self.grid.height;
        let bytes_per_row = width * 4;
        let align = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
        let padded_bytes_per_row = bytes_per_row.div_ceil(align) * align;
        let buffer_size = padded_bytes_per_row * height;

        let buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("terminal_readback"),
            size: buffer_size as u64,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("terminal_readback_encoder"),
            });

        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: &self.texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_bytes_per_row),
                    rows_per_image: Some(height),
                },
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );

        self.queue.submit(Some(encoder.finish()));

        let slice = buffer.slice(..);
        let (sender, receiver) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = sender.send(result);
        });
        self.device.poll(wgpu::PollType::wait_indefinitely()).ok();
        receiver.recv().expect("map_async callback").expect("map failed");

        let mapped = slice.get_mapped_range();
        let mut rgba = Vec::with_capacity((width * height * 4) as usize);
        for row in 0..height {
            let start = (row * padded_bytes_per_row) as usize;
            let end = start + bytes_per_row as usize;
            rgba.extend_from_slice(&mapped[start..end]);
        }
        drop(mapped);
        buffer.unmap();
        rgba
    }

    pub fn scale(&self) -> f32 {
        self.scale
    }
}

pub struct GpuContext {
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
}

impl GpuContext {
    pub async fn new() -> Self {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            flags: wgpu::InstanceFlags::default(),
            backend_options: Default::default(),
            memory_budget_thresholds: Default::default(),
            display: None,
        });
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            })
            .await
            .expect("no wgpu adapter");
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("workspace_gpu"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                memory_hints: wgpu::MemoryHints::Performance,
                experimental_features: wgpu::ExperimentalFeatures::disabled(),
                trace: wgpu::Trace::Off,
            })
            .await
            .expect("failed to create wgpu device");
        Self { device, queue }
    }

    pub fn from_wgpu(device: wgpu::Device, queue: wgpu::Queue) -> Self {
        Self { device, queue }
    }
}
