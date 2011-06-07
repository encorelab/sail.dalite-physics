$: << "sail.rb/lib"
require 'sail/daemon'

@daemon = Sail::Daemon.spawn(
  :name => "dalite-physics",
  :path => '.',
  :verbose => true
)

SAIL_ENV = :production
RUN_ID = 2
CMS_BASE_URL = "http://arlo.proto.encorelab.org"

require 'inquisitor'
@daemon << Inquisitor.new(:run_id => 2)

@daemon.start