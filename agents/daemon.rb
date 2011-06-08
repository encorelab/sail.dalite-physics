$: << "sail.rb/lib"
require 'sail/daemon'

load 'config.rb'

@daemon = Sail::Daemon.spawn(
  :name => "dalite-physics",
  :path => '.',
  :verbose => true
)



require 'inquisitor'
@daemon << Inquisitor.new

@daemon.start