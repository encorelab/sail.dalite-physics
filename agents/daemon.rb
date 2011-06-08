$: << "sail.rb/lib"
require 'sail/daemon'

@daemon = Sail::Daemon.spawn(
  :name => "dalite-physics",
  :path => '.',
  :verbose => true
)

#RUN_ID = 2
RUN_ID = 6
ARLO_URL = "http://arlo.proto.encorelab.org"
#ROLLCALL_URL = "http://rollcall.proto.encorelab.org"
ROLLCALL_URL = "http://localhost:3000"
XMPP_DOMAIN = "proto.encorelab.org"

require 'inquisitor'
@daemon << Inquisitor.new(:run_id => RUN_ID)

@daemon.start